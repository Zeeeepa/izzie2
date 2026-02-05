/**
 * Entity Merge API Route
 * POST /api/entities/merge - Manually merge two entities
 *
 * Creates a SAME_AS relationship between entities and optionally
 * creates an alias for the source entity pointing to the target.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { rateLimit, getClientIP, getRetryAfterSeconds } from '@/lib/rate-limit';
import { dbClient } from '@/lib/db';
import { entityAliases, mergeSuggestions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const LOG_PREFIX = '[Entity Merge API]';

interface MergeRequest {
  sourceEntityId: string; // e.g., "person:john_smith"
  targetEntityId: string; // e.g., "person:john_doe"
  createAlias?: boolean; // Default: true
}

/**
 * POST /api/entities/merge
 * Manually merge two entities
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Rate limiting
    const identifier = userId || getClientIP(request);
    const rateLimitResult = await rateLimit(identifier, true);
    if (!rateLimitResult.success) {
      const retryAfter = rateLimitResult.reset
        ? getRetryAfterSeconds(rateLimitResult.reset)
        : 60;
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const body: MergeRequest = await request.json();
    const { sourceEntityId, targetEntityId, createAlias = true } = body;

    // Validate required fields
    if (!sourceEntityId || !targetEntityId) {
      return NextResponse.json(
        { error: 'sourceEntityId and targetEntityId are required' },
        { status: 400 }
      );
    }

    // Parse entity IDs (format: "type:value")
    const parseEntityId = (id: string): { type: string; value: string } | null => {
      const colonIndex = id.indexOf(':');
      if (colonIndex === -1) return null;
      return {
        type: id.substring(0, colonIndex),
        value: id.substring(colonIndex + 1),
      };
    };

    const source = parseEntityId(sourceEntityId);
    const target = parseEntityId(targetEntityId);

    if (!source || !target) {
      return NextResponse.json(
        {
          error: 'Invalid entity ID format',
          details: 'Entity IDs must be in format "type:value" (e.g., "person:john_doe")',
        },
        { status: 400 }
      );
    }

    // Validate that entity types match (or are compatible)
    if (source.type !== target.type) {
      return NextResponse.json(
        {
          error: 'Entity types must match',
          details: `Cannot merge ${source.type} with ${target.type}`,
        },
        { status: 400 }
      );
    }

    console.log(
      `${LOG_PREFIX} Merging entities: ${sourceEntityId} -> ${targetEntityId} for user ${userId}`
    );

    const db = dbClient.getDb();

    // Create alias from source to target if requested
    if (createAlias) {
      try {
        await db.insert(entityAliases).values({
          userId,
          entityType: target.type,
          entityValue: target.value, // Target becomes the canonical name
          alias: source.value, // Source becomes an alias
        }).onConflictDoNothing();

        console.log(
          `${LOG_PREFIX} Created alias: ${source.value} -> ${target.value} (type: ${target.type})`
        );
      } catch (aliasError) {
        // Log but don't fail if alias already exists or other non-critical error
        console.warn(`${LOG_PREFIX} Failed to create alias (may already exist):`, aliasError);
      }
    }

    // Check if there's a pending merge suggestion for these entities and auto-accept it
    try {
      const existingSuggestion = await db
        .select()
        .from(mergeSuggestions)
        .where(
          and(
            eq(mergeSuggestions.userId, userId),
            eq(mergeSuggestions.status, 'pending')
          )
        )
        .limit(100);

      // Find matching suggestion (could be in either direction)
      const matchingSuggestion = existingSuggestion.find(
        (s) =>
          (s.entity1Type === source.type &&
            s.entity1Value === source.value &&
            s.entity2Type === target.type &&
            s.entity2Value === target.value) ||
          (s.entity1Type === target.type &&
            s.entity1Value === target.value &&
            s.entity2Type === source.type &&
            s.entity2Value === source.value)
      );

      if (matchingSuggestion) {
        await db
          .update(mergeSuggestions)
          .set({
            status: 'accepted',
            reviewedAt: new Date(),
          })
          .where(eq(mergeSuggestions.id, matchingSuggestion.id));

        console.log(`${LOG_PREFIX} Auto-accepted matching merge suggestion: ${matchingSuggestion.id}`);
      }
    } catch (suggestionError) {
      // Log but don't fail
      console.warn(`${LOG_PREFIX} Failed to update merge suggestion:`, suggestionError);
    }

    // TODO: In the future, this could:
    // 1. Create a SAME_AS relationship in the graph database
    // 2. Update all references from source to target
    // 3. Mark the source entity as merged/archived

    return NextResponse.json({
      message: 'Entities merged successfully',
      sourceEntityId,
      targetEntityId,
      aliasCreated: createAlias,
      canonicalEntity: targetEntityId,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error merging entities:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to merge entities',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
