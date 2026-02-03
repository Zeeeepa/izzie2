/**
 * POST /api/discover/reset
 * Reset all training/discovery data for the current user
 *
 * This endpoint clears:
 * - Database tables: training_sessions, training_samples, training_exceptions,
 *   training_progress, extraction_progress
 * - Weaviate collections: All entity types and relationships for the user's tenant
 *
 * NOTE: This is a destructive operation that cannot be undone.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import { dbClient } from '@/lib/db';
import {
  trainingSessions,
  trainingSamples,
  trainingExceptions,
  trainingProgress,
  extractionProgress,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  deleteTenantFromAllCollections,
  getWeaviateClient,
  COLLECTIONS,
  RELATIONSHIP_COLLECTION,
} from '@/lib/weaviate';

const LOG_PREFIX = '[Discover Reset]';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuthWithTestBypass(request);

    console.log(`${LOG_PREFIX} Starting reset for user: ${userId}`);

    const db = dbClient.getDb();
    const results = {
      database: {
        trainingSessions: 0,
        trainingSamples: 0,
        trainingExceptions: 0,
        trainingProgress: 0,
        extractionProgress: 0,
      },
      weaviate: {
        collectionsCleared: [] as string[],
        errors: [] as string[],
      },
    };

    // 1. Get all training session IDs for this user (needed for deleting samples)
    const sessions = await db
      .select({ id: trainingSessions.id })
      .from(trainingSessions)
      .where(eq(trainingSessions.userId, userId));

    const sessionIds = sessions.map((s) => s.id);
    console.log(`${LOG_PREFIX} Found ${sessionIds.length} training sessions`);

    // 2. Delete training samples (linked by session_id, not user_id)
    if (sessionIds.length > 0) {
      for (const sessionId of sessionIds) {
        const deletedSamples = await db
          .delete(trainingSamples)
          .where(eq(trainingSamples.sessionId, sessionId))
          .returning({ id: trainingSamples.id });
        results.database.trainingSamples += deletedSamples.length;
      }
    }
    console.log(`${LOG_PREFIX} Deleted ${results.database.trainingSamples} training samples`);

    // 3. Delete training exceptions
    const deletedExceptions = await db
      .delete(trainingExceptions)
      .where(eq(trainingExceptions.userId, userId))
      .returning({ id: trainingExceptions.id });
    results.database.trainingExceptions = deletedExceptions.length;
    console.log(`${LOG_PREFIX} Deleted ${results.database.trainingExceptions} training exceptions`);

    // 4. Delete training progress records
    const deletedProgress = await db
      .delete(trainingProgress)
      .where(eq(trainingProgress.userId, userId))
      .returning({ id: trainingProgress.id });
    results.database.trainingProgress = deletedProgress.length;
    console.log(`${LOG_PREFIX} Deleted ${results.database.trainingProgress} training progress records`);

    // 5. Delete training sessions (after samples are deleted due to FK)
    const deletedSessions = await db
      .delete(trainingSessions)
      .where(eq(trainingSessions.userId, userId))
      .returning({ id: trainingSessions.id });
    results.database.trainingSessions = deletedSessions.length;
    console.log(`${LOG_PREFIX} Deleted ${results.database.trainingSessions} training sessions`);

    // 6. Delete extraction progress
    const deletedExtraction = await db
      .delete(extractionProgress)
      .where(eq(extractionProgress.userId, userId))
      .returning({ id: extractionProgress.id });
    results.database.extractionProgress = deletedExtraction.length;
    console.log(`${LOG_PREFIX} Deleted ${results.database.extractionProgress} extraction progress records`);

    // 7. Clear Weaviate entity data for this user's tenant
    try {
      const client = await getWeaviateClient();

      // Collections to clear (entities and relationships, NOT memory)
      const collectionsToDelete = [
        ...Object.values(COLLECTIONS),
        RELATIONSHIP_COLLECTION,
      ];

      for (const collectionName of collectionsToDelete) {
        try {
          // Check if collection exists
          const exists = await client.collections.exists(collectionName);
          if (!exists) {
            console.log(`${LOG_PREFIX} Skipping ${collectionName} (collection does not exist)`);
            continue;
          }

          const collection = client.collections.get(collectionName);

          // Check if tenant exists
          const existingTenants = await collection.tenants.get();
          if (!(userId in existingTenants)) {
            console.log(`${LOG_PREFIX} Skipping ${collectionName} (tenant '${userId}' does not exist)`);
            continue;
          }

          // Delete the tenant (removes all data for this user in this collection)
          await collection.tenants.remove([userId]);
          results.weaviate.collectionsCleared.push(collectionName);
          console.log(`${LOG_PREFIX} Deleted tenant '${userId}' from ${collectionName}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.weaviate.errors.push(`${collectionName}: ${errorMessage}`);
          console.error(`${LOG_PREFIX} Error clearing ${collectionName}:`, error);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.weaviate.errors.push(`Connection error: ${errorMessage}`);
      console.error(`${LOG_PREFIX} Weaviate connection error:`, error);
    }

    console.log(`${LOG_PREFIX} Reset complete for user: ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Training data reset successfully',
      results,
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
        error: error instanceof Error ? error.message : 'Failed to reset training data',
      },
      { status: 500 }
    );
  }
}
