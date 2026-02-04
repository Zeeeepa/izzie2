/**
 * POST /api/discover/process-day
 * Client-driven processing: process one day per API call
 * Client polls and triggers next processing step
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { google } from 'googleapis';
import { dbClient } from '@/lib/db';
import {
  trainingSessions,
  trainingProgress,
  trainingSamples,
} from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { processIdentityRelationships } from '@/lib/extraction/identity-relationships';
import { GmailService } from '@/lib/google/gmail';
import { CalendarService } from '@/lib/google/calendar';
import { saveEntities } from '@/lib/weaviate/entities';
import { saveRelationships } from '@/lib/weaviate/relationships';
import type { InferredRelationship, RelationshipType } from '@/lib/relationships/types';
import { getActiveAutonomousSession, getAutonomousStatus } from '@/lib/training/autonomous-training';
import type { Entity } from '@/lib/extraction/types';

// Cost estimates per API call (in cents)
const COST_PER_EMAIL_EXTRACTION = 0.05;
const COST_PER_CALENDAR_EXTRACTION = 0.03;

const LOG_PREFIX = '[Discover ProcessDay]';

interface ProcessDayRequest {
  daysAgo?: number; // Which day to process (0 = today, 1 = yesterday, etc.)
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuthWithTestBypass(request);
    const body: ProcessDayRequest = await request.json().catch(() => ({}));

    // Get active discovery session
    const session = await getActiveAutonomousSession(userId);

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No active discovery session found. Start a new session first.' },
        { status: 404 }
      );
    }

    if (session.status !== 'running') {
      return NextResponse.json(
        { success: false, error: `Session is ${session.status}. Resume the session first.` },
        { status: 400 }
      );
    }

    // Check discovery budget (use new field if available, fallback to legacy)
    const budgetTotal = session.discoveryBudgetTotal ?? session.budgetTotal;
    const budgetUsed = session.discoveryBudgetUsed ?? session.budgetUsed;
    const budgetRemaining = budgetTotal - budgetUsed;
    if (budgetRemaining <= 0) {
      return NextResponse.json({
        success: true,
        complete: true,
        reason: 'budget_exhausted',
        message: 'Discovery budget exhausted. Discovery session complete.',
      });
    }

    // Get user's Google OAuth tokens
    const tokens = await getGoogleTokens(userId);
    if (!tokens || !tokens.accessToken) {
      return NextResponse.json(
        { success: false, error: 'No Google account connected.' },
        { status: 400 }
      );
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
        : 'http://localhost:3300/api/auth/callback/google'
    );

    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken || undefined,
      expiry_date: tokens.accessTokenExpiresAt
        ? new Date(tokens.accessTokenExpiresAt).getTime()
        : undefined,
    });

    oauth2Client.on('tokens', async (newTokens) => {
      console.log(`${LOG_PREFIX} Tokens refreshed for user:`, userId);
      await updateGoogleTokens(userId, newTokens);
    });

    // Find the next day to process
    const db = dbClient.getDb();
    const today = new Date();
    let daysAgo = body.daysAgo ?? 0;

    // Find the next unprocessed day (going backwards from today)
    // Max 365 days back
    let processDate: Date | null = null;
    let dateStr: string | null = null;

    for (let d = daysAgo; d < 365; d++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - d);
      const checkDateStr = checkDate.toISOString().split('T')[0];

      // Check if this day has been processed for both email and calendar
      const [emailProcessed] = await db
        .select()
        .from(trainingProgress)
        .where(
          and(
            eq(trainingProgress.userId, userId),
            eq(trainingProgress.sessionId, session.id),
            eq(trainingProgress.sourceType, 'email'),
            eq(trainingProgress.processedDate, checkDateStr)
          )
        )
        .limit(1);

      const [calendarProcessed] = await db
        .select()
        .from(trainingProgress)
        .where(
          and(
            eq(trainingProgress.userId, userId),
            eq(trainingProgress.sessionId, session.id),
            eq(trainingProgress.sourceType, 'calendar'),
            eq(trainingProgress.processedDate, checkDateStr)
          )
        )
        .limit(1);

      if (!emailProcessed || !calendarProcessed) {
        processDate = checkDate;
        dateStr = checkDateStr;
        daysAgo = d;
        break;
      }
    }

    if (!processDate || !dateStr) {
      return NextResponse.json({
        success: true,
        complete: true,
        reason: 'all_days_processed',
        message: 'All available days have been processed.',
      });
    }

    // Initialize services
    const gmailService = new GmailService(oauth2Client);
    const calendarService = new CalendarService(oauth2Client);
    const extractor = getEntityExtractor();

    let totalCost = 0;
    let itemsFound = 0;
    const nextDay = new Date(processDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Collect all extracted entities for identity relationship creation (Phase 2)
    const allExtractedEntities: Entity[] = [];

    console.log(`${LOG_PREFIX} Processing day ${dateStr} for user ${userId}`);

    // Process emails for this day
    try {
      const emails = await gmailService.searchEmails(
        `in:sent after:${dateStr} before:${nextDay.toISOString().split('T')[0]}`,
        20 // Limit per day to keep processing quick
      );

      console.log(`${LOG_PREFIX} Found ${emails.length} emails for ${dateStr}`);

      for (const email of emails) {
        if (totalCost + COST_PER_EMAIL_EXTRACTION > budgetRemaining) {
          console.log(`${LOG_PREFIX} Budget limit reached during email processing`);
          break;
        }

        try {
          const result = await extractor.extractFromEmail(email);
          totalCost += result.cost * 100;

          if (result.entities.length > 0) {
            await saveEntities(result.entities, userId, email.id);
            itemsFound += result.entities.length;
            // Collect for identity relationship creation (Phase 2)
            allExtractedEntities.push(...result.entities);
          }

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

          // Create training samples for feedback
          await createSamplesFromExtraction(db, session.id, result, 'email', dateStr);
        } catch (extractError) {
          console.error(`${LOG_PREFIX} Error extracting from email:`, extractError);
        }
      }

      // Record email processing for this day
      await db.insert(trainingProgress).values({
        userId,
        sessionId: session.id,
        sourceType: 'email',
        processedDate: dateStr,
        itemsFound: itemsFound,
      });
    } catch (emailError) {
      console.error(`${LOG_PREFIX} Error processing emails:`, emailError);
    }

    // Process calendar for this day
    let calendarItemsFound = 0;
    try {
      const { events } = await calendarService.fetchEvents({
        timeMin: processDate,
        timeMax: nextDay,
        maxResults: 20,
      });

      console.log(`${LOG_PREFIX} Found ${events.length} calendar events for ${dateStr}`);

      for (const event of events) {
        if (totalCost + COST_PER_CALENDAR_EXTRACTION > budgetRemaining) {
          console.log(`${LOG_PREFIX} Budget limit reached during calendar processing`);
          break;
        }

        try {
          const result = await extractor.extractFromCalendarEvent(event);
          totalCost += result.cost * 100;

          if (result.entities.length > 0) {
            await saveEntities(result.entities, userId, event.id);
            calendarItemsFound += result.entities.length;
            // Collect for identity relationship creation (Phase 2)
            allExtractedEntities.push(...result.entities);
          }

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
            calendarItemsFound += savedCount;
          }

          // Create training samples
          await createSamplesFromExtraction(db, session.id, result, 'calendar', dateStr);
        } catch (extractError) {
          console.error(`${LOG_PREFIX} Error extracting from calendar:`, extractError);
        }
      }

      // Record calendar processing for this day
      await db.insert(trainingProgress).values({
        userId,
        sessionId: session.id,
        sourceType: 'calendar',
        processedDate: dateStr,
        itemsFound: calendarItemsFound,
      });
    } catch (calendarError) {
      console.error(`${LOG_PREFIX} Error processing calendar:`, calendarError);
    }

    // Phase 2 Entity Resolution: Create SAME_AS relationships between identity entities
    // This runs after all entities are extracted for the day
    if (allExtractedEntities.length > 0) {
      try {
        const identityRelationshipsCreated = await processIdentityRelationships(userId, allExtractedEntities);
        if (identityRelationshipsCreated > 0) {
          console.log(`${LOG_PREFIX} Created ${identityRelationshipsCreated} SAME_AS identity relationships for ${dateStr}`);
          itemsFound += identityRelationshipsCreated;
        }
      } catch (identityError) {
        console.error(`${LOG_PREFIX} Error creating identity relationships:`, identityError);
      }
    }

    // Update session budget (both legacy and new discovery budget fields)
    await db
      .update(trainingSessions)
      .set({
        budgetUsed: sql`${trainingSessions.budgetUsed} + ${Math.round(totalCost)}`,
        discoveryBudgetUsed: sql`${trainingSessions.discoveryBudgetUsed} + ${Math.round(totalCost)}`,
        updatedAt: new Date(),
      })
      .where(eq(trainingSessions.id, session.id));

    // Get updated status
    const status = await getAutonomousStatus(session.id);

    return NextResponse.json({
      success: true,
      complete: false,
      processedDay: dateStr,
      daysAgo,
      results: {
        itemsFound: itemsFound + calendarItemsFound,
        costUsed: totalCost / 100, // Convert to dollars
      },
      // Legacy budget field (same as discoveryBudget)
      budget: status.budget,
      // Separate budgets
      discoveryBudget: status.discoveryBudget,
      trainingBudget: status.trainingBudget,
      progress: status.progress,
      nextDaysAgo: daysAgo + 1,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process day',
      },
      { status: 500 }
    );
  }
}

/**
 * Create training samples from extraction results
 */
async function createSamplesFromExtraction(
  db: ReturnType<typeof dbClient.getDb>,
  sessionId: string,
  result: {
    entities: Array<{ value: string; type: string; confidence: number; context?: string; isIdentity?: boolean }>;
    relationships: Array<{
      fromValue: string;
      fromType: string;
      toValue: string;
      toType: string;
      relationshipType: string;
      confidence: number;
      evidence?: string;
    }>;
    emailId?: string;
    eventId?: string;
  },
  sourceType: 'email' | 'calendar',
  dateStr: string
): Promise<void> {
  const samples: Array<typeof trainingSamples.$inferInsert> = [];
  const sourceId = result.emailId || result.eventId;

  // Create samples for entities
  for (const entity of result.entities) {
    samples.push({
      sessionId,
      type: 'entity',
      contentText: entity.value,
      contentContext: entity.context || `Found in ${sourceType} on ${dateStr}`,
      sourceId,
      sourceType,
      predictionLabel: entity.type,
      predictionConfidence: Math.round(entity.confidence * 100),
      predictionReasoning: `Extracted as ${entity.type} from ${sourceType}`,
      status: 'pending',
      isIdentity: entity.isIdentity ?? false,
    });
  }

  // Create samples for relationships
  for (const rel of result.relationships) {
    samples.push({
      sessionId,
      type: 'relationship',
      contentText: `${rel.fromValue} -> ${rel.toValue}`,
      contentContext: rel.evidence || `Relationship found in ${sourceType} on ${dateStr}`,
      sourceId,
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
