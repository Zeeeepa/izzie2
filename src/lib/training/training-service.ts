/**
 * Training Service
 * Core service for ML training with human-in-the-loop feedback collection
 */

import { dbClient } from '@/lib/db';
import {
  trainingSessions,
  trainingSamples,
  trainingExceptions,
  type TrainingSession as DBTrainingSession,
  type TrainingSample as DBTrainingSample,
} from '@/lib/db/schema';
import { eq, and, desc, asc, isNull, lt, sql } from 'drizzle-orm';
import type {
  TrainingSession,
  TrainingSample,
  TrainingException,
  TrainingMode,
  TrainingStatus,
  SampleType,
  FeedbackSubmission,
  TrainingStats,
} from './types';
import { sendTrainingAlert } from './alerts';
import { listEntitiesByType } from '@/lib/weaviate/entities';
import { getAllRelationships } from '@/lib/weaviate/relationships';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[TrainingService]';

// Cost estimates per API call (in cents)
const COST_PER_SAMPLE = 0.1; // ~$0.001 per token, estimate 100 tokens per sample

/**
 * Create a new training session
 */
export async function createTrainingSession(
  userId: string,
  config: {
    sampleSize: number;
    budget: number; // in cents
    mode: TrainingMode;
    sampleTypes: SampleType[];
    autoTrainThreshold?: number;
  }
): Promise<TrainingSession> {
  const db = dbClient.getDb();

  const [session] = await db
    .insert(trainingSessions)
    .values({
      userId,
      status: 'collecting',
      mode: config.mode,
      budgetTotal: config.budget,
      budgetUsed: 0,
      sampleSize: config.sampleSize,
      autoTrainThreshold: config.autoTrainThreshold || Math.floor(config.sampleSize * 0.5),
      sampleTypes: config.sampleTypes,
      samplesCollected: 0,
      feedbackReceived: 0,
      exceptionsCount: 0,
      accuracy: 0,
    })
    .returning();

  console.log(`${LOG_PREFIX} Created training session ${session.id} for user ${userId}`);

  return mapSessionFromDb(session);
}

/**
 * Get active training session for user
 */
export async function getActiveSession(userId: string): Promise<TrainingSession | null> {
  const db = dbClient.getDb();

  const [session] = await db
    .select()
    .from(trainingSessions)
    .where(
      and(
        eq(trainingSessions.userId, userId),
        isNull(trainingSessions.completedAt)
      )
    )
    .orderBy(desc(trainingSessions.createdAt))
    .limit(1);

  return session ? mapSessionFromDb(session) : null;
}

/**
 * Get training session by ID
 */
export async function getSession(sessionId: string): Promise<TrainingSession | null> {
  const db = dbClient.getDb();

  const [session] = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.id, sessionId))
    .limit(1);

  return session ? mapSessionFromDb(session) : null;
}

/**
 * Update training session status
 */
export async function updateSessionStatus(
  sessionId: string,
  status: TrainingStatus
): Promise<TrainingSession | null> {
  const db = dbClient.getDb();

  const updates: Partial<typeof trainingSessions.$inferInsert> = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'complete') {
    updates.completedAt = new Date();
  }

  const [session] = await db
    .update(trainingSessions)
    .set(updates)
    .where(eq(trainingSessions.id, sessionId))
    .returning();

  console.log(`${LOG_PREFIX} Updated session ${sessionId} status to ${status}`);

  return session ? mapSessionFromDb(session) : null;
}

/**
 * Update training budget
 */
export async function updateBudget(
  sessionId: string,
  newBudget: number
): Promise<TrainingSession | null> {
  const db = dbClient.getDb();

  const [session] = await db
    .update(trainingSessions)
    .set({
      budgetTotal: newBudget,
      updatedAt: new Date(),
    })
    .where(eq(trainingSessions.id, sessionId))
    .returning();

  console.log(`${LOG_PREFIX} Updated session ${sessionId} budget to ${newBudget} cents`);

  return session ? mapSessionFromDb(session) : null;
}

/**
 * Get next sample for feedback
 */
export async function getNextSample(sessionId: string): Promise<TrainingSample | null> {
  const db = dbClient.getDb();

  const [sample] = await db
    .select()
    .from(trainingSamples)
    .where(
      and(
        eq(trainingSamples.sessionId, sessionId),
        eq(trainingSamples.status, 'pending')
      )
    )
    .orderBy(asc(trainingSamples.createdAt))
    .limit(1);

  return sample ? mapSampleFromDb(sample) : null;
}

/**
 * Get pending samples count
 */
export async function getPendingSamplesCount(sessionId: string): Promise<number> {
  const db = dbClient.getDb();

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(trainingSamples)
    .where(
      and(
        eq(trainingSamples.sessionId, sessionId),
        eq(trainingSamples.status, 'pending')
      )
    );

  return result[0]?.count || 0;
}

/**
 * Submit feedback for a sample
 */
export async function submitFeedback(
  submission: FeedbackSubmission
): Promise<TrainingSample | null> {
  const db = dbClient.getDb();

  const [sample] = await db
    .update(trainingSamples)
    .set({
      status: 'reviewed',
      feedbackIsCorrect: submission.isCorrect,
      feedbackCorrectedLabel: submission.correctedLabel,
      feedbackNotes: submission.notes,
      feedbackAt: new Date(),
    })
    .where(eq(trainingSamples.id, submission.sampleId))
    .returning();

  if (!sample) {
    return null;
  }

  // Update session stats
  await updateSessionStats(sample.sessionId);

  console.log(`${LOG_PREFIX} Submitted feedback for sample ${submission.sampleId}`);

  return mapSampleFromDb(sample);
}

/**
 * Skip a sample
 */
export async function skipSample(sampleId: string): Promise<TrainingSample | null> {
  const db = dbClient.getDb();

  const [sample] = await db
    .update(trainingSamples)
    .set({
      status: 'skipped',
    })
    .where(eq(trainingSamples.id, sampleId))
    .returning();

  return sample ? mapSampleFromDb(sample) : null;
}

/**
 * Generate training samples from real entities/relationships in Weaviate
 * Queries the knowledge graph and creates samples for human-in-the-loop feedback
 */
export async function generateSamples(
  sessionId: string,
  count: number
): Promise<number> {
  const db = dbClient.getDb();

  // Get session to check sample types and userId
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Check budget
  const estimatedCost = count * COST_PER_SAMPLE;
  if (session.budget.remaining < estimatedCost) {
    console.warn(`${LOG_PREFIX} Insufficient budget for ${count} samples`);
    return 0;
  }

  const sampleTypes = session.config.sampleTypes;
  const samples: Array<typeof trainingSamples.$inferInsert> = [];
  const userId = session.userId;

  // Entity types to query from Weaviate
  const entityTypes: EntityType[] = ['person', 'company', 'project', 'topic', 'location', 'tool', 'action_item'];

  // Collect entity samples if 'entity' is in sampleTypes
  if (sampleTypes.includes('entity')) {
    console.log(`${LOG_PREFIX} Querying entities from Weaviate for user ${userId}...`);

    for (const entityType of entityTypes) {
      try {
        const entities = await listEntitiesByType(userId, entityType, Math.ceil(count / entityTypes.length));

        for (const entity of entities) {
          if (samples.length >= count) break;

          samples.push({
            sessionId,
            type: 'entity',
            contentText: entity.value,
            contentContext: entity.sourceId ? `Found in source: ${entity.sourceId}` : 'Extracted from user data',
            sourceId: entity.sourceId,
            predictionLabel: entity.type,
            predictionConfidence: Math.round((entity.confidence || 0.8) * 100),
            predictionReasoning: `Extracted as ${entity.type} based on context: "${entity.context || 'N/A'}"`,
            status: 'pending',
          });
        }
      } catch (error) {
        console.warn(`${LOG_PREFIX} Failed to fetch ${entityType} entities:`, error);
      }

      if (samples.length >= count) break;
    }
  }

  // Collect relationship samples if 'relationship' is in sampleTypes
  if (sampleTypes.includes('relationship') && samples.length < count) {
    console.log(`${LOG_PREFIX} Querying relationships from Weaviate for user ${userId}...`);

    try {
      const relationships = await getAllRelationships(userId, count - samples.length);

      for (const rel of relationships) {
        if (samples.length >= count) break;

        samples.push({
          sessionId,
          type: 'relationship',
          contentText: `${rel.fromEntityValue} → ${rel.toEntityValue}`,
          contentContext: rel.evidence || `Relationship between ${rel.fromEntityType} and ${rel.toEntityType}`,
          sourceId: rel.sourceId,
          predictionLabel: rel.relationshipType,
          predictionConfidence: Math.round((rel.confidence || 0.8) * 100),
          predictionReasoning: `${rel.fromEntityValue} ${rel.relationshipType} ${rel.toEntityValue}`,
          status: 'pending',
        });
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to fetch relationships:`, error);
    }
  }

  // Handle empty data case - no entities or relationships found
  if (samples.length === 0) {
    console.log(`${LOG_PREFIX} No entities or relationships found in Weaviate. Run Discovery first to extract data.`);

    // Create a single informational sample to guide the user
    samples.push({
      sessionId,
      type: sampleTypes[0] || 'entity',
      contentText: 'No data available for training',
      contentContext: 'Run Discovery on your emails or calendar to extract entities and relationships first.',
      predictionLabel: 'info',
      predictionConfidence: 100,
      predictionReasoning: 'Please run the Discovery process to populate your knowledge graph before training.',
      status: 'pending',
    });
  }

  if (samples.length > 0) {
    await db.insert(trainingSamples).values(samples);

    // Update session stats
    await db
      .update(trainingSessions)
      .set({
        samplesCollected: sql`${trainingSessions.samplesCollected} + ${samples.length}`,
        budgetUsed: sql`${trainingSessions.budgetUsed} + ${Math.round(samples.length * COST_PER_SAMPLE)}`,
        updatedAt: new Date(),
      })
      .where(eq(trainingSessions.id, sessionId));
  }

  console.log(`${LOG_PREFIX} Generated ${samples.length} samples from Weaviate data for session ${sessionId}`);

  return samples.length;
}

/**
 * Get uncertain samples (low confidence) for human review
 */
export async function getUncertainSamples(
  sessionId: string,
  limit: number = 10,
  maxConfidence: number = 70
): Promise<TrainingSample[]> {
  const db = dbClient.getDb();

  const samples = await db
    .select()
    .from(trainingSamples)
    .where(
      and(
        eq(trainingSamples.sessionId, sessionId),
        eq(trainingSamples.status, 'pending'),
        lt(trainingSamples.predictionConfidence, maxConfidence)
      )
    )
    .orderBy(asc(trainingSamples.predictionConfidence))
    .limit(limit);

  return samples.map(mapSampleFromDb);
}

/**
 * Flag an exception for user review
 */
export async function flagException(
  sessionId: string,
  userId: string,
  item: { sampleId?: string; content: string; context?: string },
  reason: string,
  type: TrainingException['type'] = 'low_confidence',
  severity: TrainingException['severity'] = 'medium'
): Promise<TrainingException> {
  const db = dbClient.getDb();

  const [exception] = await db
    .insert(trainingExceptions)
    .values({
      sessionId,
      userId,
      type,
      severity,
      reason,
      itemSampleId: item.sampleId,
      itemContent: item.content,
      itemContext: item.context,
      status: 'pending',
    })
    .returning();

  // Update session exception count
  await db
    .update(trainingSessions)
    .set({
      exceptionsCount: sql`${trainingSessions.exceptionsCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(trainingSessions.id, sessionId));

  console.log(`${LOG_PREFIX} Flagged exception for session ${sessionId}: ${reason}`);

  // Send alert (fire-and-forget)
  sendTrainingAlert(userId, mapExceptionFromDb(exception)).catch((err) => {
    console.error(`${LOG_PREFIX} Failed to send alert:`, err);
  });

  return mapExceptionFromDb(exception);
}

/**
 * Get pending exceptions for a session
 */
export async function getExceptions(
  sessionId: string,
  status?: TrainingException['status']
): Promise<TrainingException[]> {
  const db = dbClient.getDb();

  const conditions = [eq(trainingExceptions.sessionId, sessionId)];
  if (status) {
    conditions.push(eq(trainingExceptions.status, status));
  }

  const exceptions = await db
    .select()
    .from(trainingExceptions)
    .where(and(...conditions))
    .orderBy(desc(trainingExceptions.createdAt));

  return exceptions.map(mapExceptionFromDb);
}

/**
 * Update exception status
 */
export async function updateException(
  exceptionId: string,
  status: TrainingException['status']
): Promise<TrainingException | null> {
  const db = dbClient.getDb();

  const [exception] = await db
    .update(trainingExceptions)
    .set({
      status,
      reviewedAt: status === 'reviewed' ? new Date() : undefined,
    })
    .where(eq(trainingExceptions.id, exceptionId))
    .returning();

  return exception ? mapExceptionFromDb(exception) : null;
}

/**
 * Get training statistics
 */
export async function getTrainingStats(sessionId: string): Promise<TrainingStats> {
  const db = dbClient.getDb();

  const samples = await db
    .select()
    .from(trainingSamples)
    .where(eq(trainingSamples.sessionId, sessionId));

  const session = await getSession(sessionId);

  const totalSamples = samples.length;
  const reviewedSamples = samples.filter((s) => s.status === 'reviewed').length;
  const correctPredictions = samples.filter((s) => s.feedbackIsCorrect === true).length;
  const accuracy = reviewedSamples > 0 ? (correctPredictions / reviewedSamples) * 100 : 0;

  // Calculate by type
  const byType: TrainingStats['byType'] = {
    entity: { total: 0, reviewed: 0, accuracy: 0 },
    relationship: { total: 0, reviewed: 0, accuracy: 0 },
    classification: { total: 0, reviewed: 0, accuracy: 0 },
  };

  for (const sample of samples) {
    const type = sample.type as SampleType;
    if (byType[type]) {
      byType[type].total++;
      if (sample.status === 'reviewed') {
        byType[type].reviewed++;
        if (sample.feedbackIsCorrect) {
          byType[type].accuracy += 1;
        }
      }
    }
  }

  // Calculate accuracy percentage for each type
  for (const type of Object.keys(byType) as SampleType[]) {
    if (byType[type].reviewed > 0) {
      byType[type].accuracy = (byType[type].accuracy / byType[type].reviewed) * 100;
    }
  }

  return {
    totalSamples,
    reviewedSamples,
    correctPredictions,
    accuracy: Math.round(accuracy * 100) / 100,
    costUsed: session?.budget.used || 0,
    exceptionsCount: session?.progress.exceptionsCount || 0,
    byType,
  };
}

/**
 * Update session statistics based on current samples
 */
async function updateSessionStats(sessionId: string): Promise<void> {
  const db = dbClient.getDb();

  const samples = await db
    .select()
    .from(trainingSamples)
    .where(eq(trainingSamples.sessionId, sessionId));

  const reviewedSamples = samples.filter((s) => s.status === 'reviewed').length;
  const correctPredictions = samples.filter((s) => s.feedbackIsCorrect === true).length;
  const accuracy = reviewedSamples > 0 ? (correctPredictions / reviewedSamples) * 100 : 0;

  await db
    .update(trainingSessions)
    .set({
      feedbackReceived: reviewedSamples,
      accuracy: Math.round(accuracy * 100) / 100,
      updatedAt: new Date(),
    })
    .where(eq(trainingSessions.id, sessionId));
}

/**
 * Run the training loop for a session
 * This is the main entry point for the active learning loop
 */
export async function runTrainingLoop(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'collecting' && session.status !== 'training') {
    console.log(`${LOG_PREFIX} Session ${sessionId} is not in a runnable state`);
    return;
  }

  // Check if we have enough feedback for auto-training
  if (
    session.mode === 'auto_train' &&
    session.progress.feedbackReceived >= session.config.autoTrainThreshold
  ) {
    await updateSessionStatus(sessionId, 'training');
    console.log(`${LOG_PREFIX} Session ${sessionId} reached auto-train threshold`);
    // TODO: Implement actual model training here
    return;
  }

  // Generate more samples if needed
  const pendingSamples = await getPendingSamplesCount(sessionId);
  if (pendingSamples < 5 && session.progress.samplesCollected < session.config.sampleSize) {
    const toGenerate = Math.min(
      10,
      session.config.sampleSize - session.progress.samplesCollected
    );
    await generateSamples(sessionId, toGenerate);
  }

  console.log(`${LOG_PREFIX} Training loop iteration complete for session ${sessionId}`);
}

// ============================================================
// Database Mapping Helpers
// ============================================================

function mapSessionFromDb(session: DBTrainingSession): TrainingSession {
  return {
    id: session.id,
    userId: session.userId,
    status: session.status as TrainingStatus,
    mode: session.mode as TrainingMode,
    budget: {
      total: session.budgetTotal,
      used: session.budgetUsed,
      remaining: session.budgetTotal - session.budgetUsed,
    },
    progress: {
      samplesCollected: session.samplesCollected,
      feedbackReceived: session.feedbackReceived,
      exceptionsCount: session.exceptionsCount,
      accuracy: session.accuracy,
    },
    config: {
      sampleSize: session.sampleSize,
      autoTrainThreshold: session.autoTrainThreshold,
      sampleTypes: (session.sampleTypes || ['entity']) as SampleType[],
    },
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt || undefined,
  };
}

function mapSampleFromDb(sample: DBTrainingSample): TrainingSample {
  return {
    id: sample.id,
    sessionId: sample.sessionId,
    type: sample.type as SampleType,
    content: {
      text: sample.contentText,
      context: sample.contentContext || undefined,
      sourceId: sample.sourceId || undefined,
      sourceType: sample.sourceType as TrainingSample['content']['sourceType'],
    },
    prediction: {
      label: sample.predictionLabel,
      confidence: sample.predictionConfidence,
      reasoning: sample.predictionReasoning || undefined,
    },
    feedback: sample.feedbackAt
      ? {
          isCorrect: sample.feedbackIsCorrect || false,
          correctedLabel: sample.feedbackCorrectedLabel || undefined,
          notes: sample.feedbackNotes || undefined,
          feedbackAt: sample.feedbackAt,
        }
      : undefined,
    status: sample.status as TrainingSample['status'],
    createdAt: sample.createdAt,
  };
}

function mapExceptionFromDb(exception: any): TrainingException {
  return {
    id: exception.id,
    sessionId: exception.sessionId,
    userId: exception.userId,
    type: exception.type,
    item: {
      sampleId: exception.itemSampleId || undefined,
      content: exception.itemContent,
      context: exception.itemContext || undefined,
    },
    reason: exception.reason,
    severity: exception.severity,
    status: exception.status,
    notifiedAt: exception.notifiedAt || undefined,
    reviewedAt: exception.reviewedAt || undefined,
    createdAt: exception.createdAt,
  };
}
