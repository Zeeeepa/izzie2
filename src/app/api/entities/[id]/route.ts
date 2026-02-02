/**
 * Entity Detail API Route
 * GET /api/entities/[id] - Get detailed information about a specific entity
 *
 * Returns:
 *  - Entity data
 *  - Relationship score
 *  - Timeline (last 10 entries)
 *  - Related entities
 *
 * Entity ID format: "{type}:{value}" (e.g., "person:john_doe")
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { listEntitiesByType } from '@/lib/weaviate/entities';
import { getEntityRelationships } from '@/lib/weaviate/relationships';
import { calculateRelationshipStrength } from '@/lib/relationships/scoring';
import {
  getEntityTimeline,
  getEntityFirstSeen,
  getEntityLastSeen,
  getRelatedEntities,
} from '@/lib/entities/timeline';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Entity Detail API]';

// Valid entity types
const VALID_TYPES: EntityType[] = [
  'person',
  'company',
  'project',
  'topic',
  'location',
  'action_item',
];

interface EntityDetailResponse {
  entity: {
    id: string;
    type: EntityType;
    value: string;
    normalized: string;
    confidence: number;
    source: string;
    context?: string;
    firstSeen: string | null;
    lastSeen: string | null;
  };
  relationshipScore: {
    strength: number;
    interactionCount: number;
    factors: {
      emailFrequency: number;
      calendarFrequency: number;
      recency: number;
      sentiment: number;
    };
  } | null;
  timeline: Array<{
    date: string;
    source: string;
    sourceId: string;
    action: string;
    context: string;
    relatedEntity?: {
      type: string;
      value: string;
    };
  }>;
  relatedEntities: Array<{
    entityType: string;
    entityValue: string;
    coOccurrenceCount: number;
    relationshipTypes: string[];
  }>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication and get userId for multi-tenant isolation
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Get entity ID from params (URL-decoded)
    const { id: rawId } = await params;
    const entityId = decodeURIComponent(rawId);

    console.log(`${LOG_PREFIX} Getting details for entity: ${entityId} (user: ${userId})`);

    // Parse entity ID (format: "type:value")
    const colonIndex = entityId.indexOf(':');
    if (colonIndex === -1) {
      return NextResponse.json(
        {
          error: 'Invalid entity ID format',
          details: 'Entity ID must be in format "type:value" (e.g., "person:john_doe")',
        },
        { status: 400 }
      );
    }

    const entityType = entityId.substring(0, colonIndex) as EntityType;
    const entityValue = entityId.substring(colonIndex + 1);

    // Validate entity type
    if (!VALID_TYPES.includes(entityType)) {
      return NextResponse.json(
        {
          error: 'Invalid entity type',
          details: `Entity type must be one of: ${VALID_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Get optional query params
    const { searchParams } = new URL(request.url);
    const timelineLimit = Math.min(
      parseInt(searchParams.get('timelineLimit') || '10', 10),
      50
    );
    const relatedLimit = Math.min(
      parseInt(searchParams.get('relatedLimit') || '10', 10),
      30
    );

    // Fetch entity data from Weaviate, filtered by userId for multi-tenant isolation
    const entities = await listEntitiesByType(userId, entityType, 1000);
    const normalizedSearchValue = entityValue.toLowerCase();

    const matchedEntity = entities.find(
      (e) =>
        (e.normalized || e.value || '').toLowerCase() === normalizedSearchValue ||
        (e.value || '').toLowerCase() === normalizedSearchValue
    );

    if (!matchedEntity) {
      return NextResponse.json(
        {
          error: 'Entity not found',
          details: `No ${entityType} entity found with value "${entityValue}"`,
        },
        { status: 404 }
      );
    }

    // Fetch relationship score
    const relationshipScore = await calculateRelationshipStrength(
      session.user.id,
      entityId
    );

    // Fetch timeline
    const timeline = await getEntityTimeline(session.user.id, entityId, timelineLimit);

    // Fetch first/last seen dates
    const [firstSeen, lastSeen] = await Promise.all([
      getEntityFirstSeen(session.user.id, entityId),
      getEntityLastSeen(session.user.id, entityId),
    ]);

    // Fetch related entities
    const relatedEntities = await getRelatedEntities(
      session.user.id,
      entityId,
      relatedLimit
    );

    // Build response
    const response: EntityDetailResponse = {
      entity: {
        id: entityId,
        type: entityType,
        value: matchedEntity.value || '',
        normalized: matchedEntity.normalized || matchedEntity.value || '',
        confidence: matchedEntity.confidence || 0,
        source: matchedEntity.source || 'unknown',
        context: matchedEntity.context,
        firstSeen: firstSeen?.toISOString() || null,
        lastSeen: lastSeen?.toISOString() || null,
      },
      relationshipScore: relationshipScore
        ? {
            strength: relationshipScore.strength,
            interactionCount: relationshipScore.interactionCount,
            factors: relationshipScore.factors,
          }
        : null,
      timeline: timeline.map((entry) => ({
        date: entry.date.toISOString(),
        source: entry.source,
        sourceId: entry.sourceId,
        action: entry.action,
        context: entry.context,
        relatedEntity: entry.relatedEntity
          ? {
              type: entry.relatedEntity.type,
              value: entry.relatedEntity.value,
            }
          : undefined,
      })),
      relatedEntities: relatedEntities.map((e) => ({
        entityType: e.entityType,
        entityValue: e.entityValue,
        coOccurrenceCount: e.coOccurrenceCount,
        relationshipTypes: e.relationshipTypes,
      })),
    };

    console.log(
      `${LOG_PREFIX} Returning entity details: ` +
        `score=${relationshipScore?.strength?.toFixed(3) || 'N/A'}, ` +
        `timeline=${timeline.length}, ` +
        `related=${relatedEntities.length}`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get entity details:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch entity details',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
