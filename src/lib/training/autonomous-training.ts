/**
 * Autonomous Training Service
 * Processes emails and calendar events day-by-day for entity/relationship extraction
 * Tracks processed days to avoid repetition and respects budget limits
 */

import { dbClient } from '@/lib/db';
import {
  trainingSessions,
  trainingProgress,
  trainingSamples,
  type TrainingSession as DBTrainingSession,
} from '@/lib/db/schema';
import { eq, and, desc, sql, isNull } from 'drizzle-orm';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { GmailService } from '@/lib/google/gmail';
import { CalendarService } from '@/lib/google/calendar';
import { saveEntities } from '@/lib/weaviate/entities';
import { saveRelationships } from '@/lib/weaviate/relationships';
import type { InferredRelationship, RelationshipType } from '@/lib/relationships/types';
import type { Auth } from 'googleapis';
import type {
  TrainingSession,
  TrainingStatus,
  TrainingMode,
  DiscoveredItem,
  TrainingProgressEntry,
  AutonomousTrainingStatus,
  TrainingSourceType,
  MIN_FEEDBACK_FOR_AUTO_TRAIN,
} from './types';

const LOG_PREFIX = '[AutonomousTraining]';

// Cost estimates per API call (in cents)
const COST_PER_EMAIL_EXTRACTION = 0.05; // ~$0.0005 per extraction
const COST_PER_CALENDAR_EXTRACTION = 0.03; // Slightly cheaper, less content

/**
 * Start an autonomous training session
 */
export async function startAutonomousTraining(
  userId: string,
  auth: Auth.OAuth2Client,
  config: {
    budget: number; // in cents (discovery budget)
    trainingBudget?: number; // in cents (training budget, optional)
    mode?: TrainingMode;
  }
): Promise<{ sessionId: string; status: AutonomousTrainingStatus }> {
  const db = dbClient.getDb();

  // Check for existing active session
  const existingSession = await getActiveAutonomousSession(userId);
  if (existingSession && existingSession.status === 'running') {
    return {
      sessionId: existingSession.id,
      status: await getAutonomousStatus(existingSession.id),
    };
  }

  // Create new session with separate discovery budget
  const [session] = await db
    .insert(trainingSessions)
    .values({
      userId,
      status: 'running',
      mode: config.mode || 'collect_feedback',
      // Legacy fields (for backward compatibility)
      budgetTotal: config.budget,
      budgetUsed: 0,
      // New separate budget fields
      discoveryBudgetTotal: config.budget,
      discoveryBudgetUsed: 0,
      trainingBudgetTotal: config.trainingBudget || 500, // Default $5 for training
      trainingBudgetUsed: 0,
      sampleSize: 1000, // High limit for autonomous
      autoTrainThreshold: 50,
      sampleTypes: ['entity', 'relationship'],
      samplesCollected: 0,
      feedbackReceived: 0,
      exceptionsCount: 0,
      accuracy: 0,
    })
    .returning();

  console.log(`${LOG_PREFIX} Created autonomous training session ${session.id} for user ${userId}`);

  // Start background processing (fire and forget)
  runAutonomousProcessing(session.id, userId, auth).catch((err) => {
    console.error(`${LOG_PREFIX} Background processing failed:`, err);
  });

  return {
    sessionId: session.id,
    status: await getAutonomousStatus(session.id),
  };
}

/**
 * Get active autonomous training session for user
 */
export async function getActiveAutonomousSession(userId: string): Promise<DBTrainingSession | null> {
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

  return session || null;
}

/**
 * Get autonomous training status
 */
export async function getAutonomousStatus(sessionId: string): Promise<AutonomousTrainingStatus> {
  const db = dbClient.getDb();

  const [session] = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error('Session not found');
  }

  // Get progress stats
  const progressStats = await db
    .select({
      count: sql<number>`count(*)`,
      totalItems: sql<number>`sum(${trainingProgress.itemsFound})`,
    })
    .from(trainingProgress)
    .where(eq(trainingProgress.sessionId, sessionId));

  const daysProcessed = progressStats[0]?.count || 0;
  const itemsDiscovered = progressStats[0]?.totalItems || 0;

  return {
    sessionId,
    status: session.status as TrainingStatus,
    // Legacy budget (for backward compatibility)
    budget: {
      total: session.discoveryBudgetTotal,
      used: session.discoveryBudgetUsed,
      remaining: session.discoveryBudgetTotal - session.discoveryBudgetUsed,
    },
    // Separate budgets
    discoveryBudget: {
      total: session.discoveryBudgetTotal,
      used: session.discoveryBudgetUsed,
      remaining: session.discoveryBudgetTotal - session.discoveryBudgetUsed,
    },
    trainingBudget: {
      total: session.trainingBudgetTotal,
      used: session.trainingBudgetUsed,
      remaining: session.trainingBudgetTotal - session.trainingBudgetUsed,
    },
    progress: {
      daysProcessed,
      itemsDiscovered,
    },
    startedAt: session.createdAt,
    completedAt: session.completedAt || undefined,
  };
}

/**
 * Check if a specific date has been processed for a source type
 */
async function isDateProcessed(
  userId: string,
  sourceType: TrainingSourceType,
  date: string // YYYY-MM-DD
): Promise<boolean> {
  const db = dbClient.getDb();

  const [existing] = await db
    .select()
    .from(trainingProgress)
    .where(
      and(
        eq(trainingProgress.userId, userId),
        eq(trainingProgress.sourceType, sourceType),
        eq(trainingProgress.processedDate, date)
      )
    )
    .limit(1);

  return !!existing;
}

/**
 * Record that a date has been processed
 */
async function recordDateProcessed(
  userId: string,
  sessionId: string,
  sourceType: TrainingSourceType,
  date: string,
  itemsFound: number
): Promise<void> {
  const db = dbClient.getDb();

  await db.insert(trainingProgress).values({
    userId,
    sessionId,
    sourceType,
    processedDate: date,
    itemsFound,
  });
}

/**
 * Run autonomous processing in the background
 */
async function runAutonomousProcessing(
  sessionId: string,
  userId: string,
  auth: Auth.OAuth2Client
): Promise<void> {
  const db = dbClient.getDb();
  const gmailService = new GmailService(auth);
  const calendarService = new CalendarService(auth);
  const extractor = getEntityExtractor();

  let totalCost = 0;
  let daysProcessed = 0;
  const today = new Date();

  console.log(`${LOG_PREFIX} Starting autonomous processing for session ${sessionId}`);

  try {
    // Process day by day, going backwards from today
    for (let daysAgo = 0; daysAgo < 365; daysAgo++) {
      // Check budget
      const session = await getSessionById(sessionId);
      if (!session) {
        console.log(`${LOG_PREFIX} Session ${sessionId} not found, stopping`);
        break;
      }

      const budgetRemaining = session.discoveryBudgetTotal - session.discoveryBudgetUsed;
      if (budgetRemaining <= 0) {
        console.log(`${LOG_PREFIX} Discovery budget exhausted for session ${sessionId}`);
        await updateSessionStatus(sessionId, 'budget_exhausted');
        break;
      }

      // Check if session was paused or cancelled
      if (session.status === 'paused' || session.completedAt) {
        console.log(`${LOG_PREFIX} Session ${sessionId} is ${session.status}, stopping`);
        break;
      }

      // Calculate the date to process
      const processDate = new Date(today);
      processDate.setDate(processDate.getDate() - daysAgo);
      const dateStr = processDate.toISOString().split('T')[0]; // YYYY-MM-DD

      // Process emails for this day
      const emailsProcessed = await isDateProcessed(userId, 'email', dateStr);
      if (!emailsProcessed) {
        const emailCost = await processEmailsForDay(
          sessionId,
          userId,
          gmailService,
          extractor,
          processDate,
          budgetRemaining
        );
        totalCost += emailCost;

        // Update session budget
        await updateSessionBudget(sessionId, emailCost);
      }

      // Process calendar for this day
      const calendarProcessed = await isDateProcessed(userId, 'calendar', dateStr);
      if (!calendarProcessed) {
        const calendarCost = await processCalendarForDay(
          sessionId,
          userId,
          calendarService,
          extractor,
          processDate,
          budgetRemaining - (totalCost - session.budgetUsed)
        );
        totalCost += calendarCost;

        // Update session budget
        await updateSessionBudget(sessionId, calendarCost);
      }

      daysProcessed++;

      // Log progress every 10 days
      if (daysProcessed % 10 === 0) {
        console.log(`${LOG_PREFIX} Processed ${daysProcessed} days, total cost: $${(totalCost / 100).toFixed(4)}`);
      }
    }

    // Mark session as complete
    await updateSessionStatus(sessionId, 'complete');
    console.log(`${LOG_PREFIX} Completed autonomous processing for session ${sessionId}`);

  } catch (error) {
    console.error(`${LOG_PREFIX} Error in autonomous processing:`, error);
    await updateSessionStatus(sessionId, 'paused');
  }
}

/**
 * Process emails for a specific day
 */
async function processEmailsForDay(
  sessionId: string,
  userId: string,
  gmailService: GmailService,
  extractor: ReturnType<typeof getEntityExtractor>,
  date: Date,
  budgetRemaining: number
): Promise<number> {
  const dateStr = date.toISOString().split('T')[0];
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  let totalCost = 0;
  let itemsFound = 0;

  try {
    // Fetch emails for this day
    const emails = await gmailService.searchEmails(
      `in:sent after:${dateStr} before:${nextDay.toISOString().split('T')[0]}`,
      50 // Max emails per day
    );

    console.log(`${LOG_PREFIX} Found ${emails.length} emails for ${dateStr}`);

    for (const email of emails) {
      // Check budget
      if (totalCost + COST_PER_EMAIL_EXTRACTION > budgetRemaining) {
        console.log(`${LOG_PREFIX} Budget limit reached while processing emails`);
        break;
      }

      // Extract entities and relationships
      const result = await extractor.extractFromEmail(email);
      totalCost += result.cost * 100; // Convert to cents

      // Store discovered entities (batch)
      if (result.entities.length > 0) {
        await saveEntities(result.entities, userId, email.id);
        itemsFound += result.entities.length;
      }

      // Store discovered relationships (batch)
      if (result.relationships.length > 0) {
        const inferredRelationships: InferredRelationship[] = result.relationships.map((rel) => ({
          fromEntityType: rel.fromType,
          fromEntityValue: rel.fromValue,
          toEntityType: rel.toType,
          toEntityValue: rel.toValue,
          relationshipType: rel.relationshipType as RelationshipType,
          confidence: rel.confidence,
          evidence: rel.evidence,
          sourceId: email.id,
          inferredAt: new Date().toISOString(),
          userId,
        }));
        const savedCount = await saveRelationships(inferredRelationships, userId);
        itemsFound += savedCount;
      }

      // Create training samples for user feedback
      await createSamplesFromExtraction(sessionId, result, 'email', dateStr);
    }

    // Record this day as processed
    await recordDateProcessed(userId, sessionId, 'email', dateStr, itemsFound);

  } catch (error) {
    console.error(`${LOG_PREFIX} Error processing emails for ${dateStr}:`, error);
  }

  return totalCost;
}

/**
 * Process calendar events for a specific day
 */
async function processCalendarForDay(
  sessionId: string,
  userId: string,
  calendarService: CalendarService,
  extractor: ReturnType<typeof getEntityExtractor>,
  date: Date,
  budgetRemaining: number
): Promise<number> {
  const dateStr = date.toISOString().split('T')[0];
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  let totalCost = 0;
  let itemsFound = 0;

  try {
    // Fetch calendar events for this day
    const { events } = await calendarService.fetchEvents({
      timeMin: date,
      timeMax: nextDay,
      maxResults: 50,
    });

    console.log(`${LOG_PREFIX} Found ${events.length} calendar events for ${dateStr}`);

    for (const event of events) {
      // Check budget
      if (totalCost + COST_PER_CALENDAR_EXTRACTION > budgetRemaining) {
        console.log(`${LOG_PREFIX} Budget limit reached while processing calendar`);
        break;
      }

      // Extract entities and relationships
      const result = await extractor.extractFromCalendarEvent(event);
      totalCost += result.cost * 100; // Convert to cents

      // Store discovered entities (batch)
      if (result.entities.length > 0) {
        await saveEntities(result.entities, userId, event.id);
        itemsFound += result.entities.length;
      }

      // Store discovered relationships (batch)
      if (result.relationships.length > 0) {
        const inferredRelationships: InferredRelationship[] = result.relationships.map((rel) => ({
          fromEntityType: rel.fromType,
          fromEntityValue: rel.fromValue,
          toEntityType: rel.toType,
          toEntityValue: rel.toValue,
          relationshipType: rel.relationshipType as RelationshipType,
          confidence: rel.confidence,
          evidence: rel.evidence,
          sourceId: event.id,
          inferredAt: new Date().toISOString(),
          userId,
        }));
        const savedCount = await saveRelationships(inferredRelationships, userId);
        itemsFound += savedCount;
      }

      // Create training samples for user feedback
      await createSamplesFromCalendarExtraction(sessionId, result, dateStr);
    }

    // Record this day as processed
    await recordDateProcessed(userId, sessionId, 'calendar', dateStr, itemsFound);

  } catch (error) {
    console.error(`${LOG_PREFIX} Error processing calendar for ${dateStr}:`, error);
  }

  return totalCost;
}

/**
 * Create training samples from email extraction results
 */
async function createSamplesFromExtraction(
  sessionId: string,
  result: any,
  sourceType: TrainingSourceType,
  dateStr: string
): Promise<void> {
  const db = dbClient.getDb();
  const samples: Array<typeof trainingSamples.$inferInsert> = [];

  // Create samples for entities
  for (const entity of result.entities) {
    samples.push({
      sessionId,
      type: 'entity',
      contentText: entity.value,
      contentContext: entity.context || `Found in ${sourceType} on ${dateStr}`,
      sourceId: result.emailId,
      sourceType,
      predictionLabel: entity.type,
      predictionConfidence: Math.round(entity.confidence * 100),
      predictionReasoning: `Extracted as ${entity.type} from ${sourceType}`,
      status: 'pending',
    });
  }

  // Create samples for relationships
  for (const rel of result.relationships) {
    samples.push({
      sessionId,
      type: 'relationship',
      contentText: `${rel.fromValue} -> ${rel.toValue}`,
      contentContext: rel.evidence || `Relationship found in ${sourceType} on ${dateStr}`,
      sourceId: result.emailId,
      sourceType,
      predictionLabel: rel.relationshipType,
      predictionConfidence: Math.round(rel.confidence * 100),
      predictionReasoning: `${rel.fromValue} ${rel.relationshipType} ${rel.toValue}`,
      status: 'pending',
    });
  }

  if (samples.length > 0) {
    await db.insert(trainingSamples).values(samples);

    // Update session sample count
    await db
      .update(trainingSessions)
      .set({
        samplesCollected: sql`${trainingSessions.samplesCollected} + ${samples.length}`,
        updatedAt: new Date(),
      })
      .where(eq(trainingSessions.id, sessionId));
  }
}

/**
 * Create training samples from calendar extraction results
 */
async function createSamplesFromCalendarExtraction(
  sessionId: string,
  result: any,
  dateStr: string
): Promise<void> {
  await createSamplesFromExtraction(sessionId, result, 'calendar', dateStr);
}

/**
 * Get session by ID
 */
async function getSessionById(sessionId: string): Promise<DBTrainingSession | null> {
  const db = dbClient.getDb();

  const [session] = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.id, sessionId))
    .limit(1);

  return session || null;
}

/**
 * Update session status
 */
async function updateSessionStatus(
  sessionId: string,
  status: TrainingStatus
): Promise<void> {
  const db = dbClient.getDb();

  const updates: Partial<typeof trainingSessions.$inferInsert> = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'complete' || status === 'budget_exhausted') {
    updates.completedAt = new Date();
  }

  await db
    .update(trainingSessions)
    .set(updates)
    .where(eq(trainingSessions.id, sessionId));
}

/**
 * Update session discovery budget used
 */
async function updateSessionBudget(
  sessionId: string,
  costIncrement: number
): Promise<void> {
  const db = dbClient.getDb();

  await db
    .update(trainingSessions)
    .set({
      // Update both legacy and new budget columns for discovery
      budgetUsed: sql`${trainingSessions.budgetUsed} + ${Math.round(costIncrement)}`,
      discoveryBudgetUsed: sql`${trainingSessions.discoveryBudgetUsed} + ${Math.round(costIncrement)}`,
      updatedAt: new Date(),
    })
    .where(eq(trainingSessions.id, sessionId));
}

/**
 * Update session training budget used
 */
export async function updateTrainingBudget(
  sessionId: string,
  costIncrement: number
): Promise<void> {
  const db = dbClient.getDb();

  await db
    .update(trainingSessions)
    .set({
      trainingBudgetUsed: sql`${trainingSessions.trainingBudgetUsed} + ${Math.round(costIncrement)}`,
      updatedAt: new Date(),
    })
    .where(eq(trainingSessions.id, sessionId));
}

/**
 * Get all discovered items for a session (for UI display)
 */
export async function getDiscoveredItems(
  sessionId: string,
  options?: {
    limit?: number;
    offset?: number;
    type?: 'entity' | 'relationship';
  }
): Promise<DiscoveredItem[]> {
  const db = dbClient.getDb();
  const { limit = 50, offset = 0, type } = options || {};

  const conditions = [eq(trainingSamples.sessionId, sessionId)];
  if (type) {
    conditions.push(eq(trainingSamples.type, type));
  }

  const samples = await db
    .select()
    .from(trainingSamples)
    .where(and(...conditions))
    .orderBy(desc(trainingSamples.createdAt))
    .limit(limit)
    .offset(offset);

  return samples.map((sample) => ({
    id: sample.id,
    type: sample.type as 'entity' | 'relationship',
    value: sample.contentText,
    label: sample.predictionLabel,
    confidence: sample.predictionConfidence,
    context: sample.contentContext || undefined,
    sourceId: sample.sourceId || undefined,
    sourceType: sample.sourceType as TrainingSourceType | undefined,
  }));
}

/**
 * Get processing progress for a user
 */
export async function getProcessingProgress(
  userId: string,
  sessionId?: string
): Promise<TrainingProgressEntry[]> {
  const db = dbClient.getDb();

  const conditions = [eq(trainingProgress.userId, userId)];
  if (sessionId) {
    conditions.push(eq(trainingProgress.sessionId, sessionId));
  }

  const progress = await db
    .select()
    .from(trainingProgress)
    .where(and(...conditions))
    .orderBy(desc(trainingProgress.processedDate));

  return progress.map((p) => ({
    id: p.id,
    userId: p.userId,
    sessionId: p.sessionId || undefined,
    sourceType: p.sourceType as TrainingSourceType,
    processedDate: p.processedDate,
    itemsFound: p.itemsFound,
    processedAt: p.processedAt,
  }));
}

/**
 * Pause an autonomous training session
 */
export async function pauseAutonomousTraining(sessionId: string): Promise<void> {
  await updateSessionStatus(sessionId, 'paused');
}

/**
 * Resume an autonomous training session
 */
export async function resumeAutonomousTraining(
  sessionId: string,
  auth: Auth.OAuth2Client
): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  await updateSessionStatus(sessionId, 'running');

  // Restart background processing
  runAutonomousProcessing(sessionId, session.userId, auth).catch((err) => {
    console.error(`${LOG_PREFIX} Background processing failed:`, err);
  });
}

/**
 * Cancel an autonomous training session
 */
export async function cancelAutonomousTraining(sessionId: string): Promise<void> {
  await updateSessionStatus(sessionId, 'complete');
}
