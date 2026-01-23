/**
 * Entity Timeline Service
 *
 * Provides timeline views for entities showing their appearances across
 * emails, calendar events, and tasks.
 */

import { getEntityRelationships, getAllRelationships } from '../weaviate/relationships';
import { listEntitiesByType, getEntitiesBySource } from '../weaviate/entities';
import type { InferredRelationship, RelationshipType } from '../relationships/types';
import type { EntityType, Entity } from '../extraction/types';

const LOG_PREFIX = '[Entity Timeline]';

/**
 * Source types for timeline entries
 */
export type TimelineSourceType = 'email' | 'calendar' | 'task' | 'drive';

/**
 * Action types for timeline entries
 */
export type TimelineAction =
  | 'mentioned'
  | 'met_with'
  | 'emailed'
  | 'assigned_to'
  | 'collaborated_on'
  | 'discussed'
  | 'referenced';

/**
 * A single entry in an entity's timeline
 */
export interface EntityTimelineEntry {
  /** Timestamp of the interaction */
  date: Date;
  /** Source type (email, calendar, task, drive) */
  source: TimelineSourceType;
  /** ID of the source item (email ID, event ID, etc.) */
  sourceId: string;
  /** Action type describing the interaction */
  action: TimelineAction;
  /** Brief context about the interaction */
  context: string;
  /** Confidence score of the relationship */
  confidence?: number;
  /** Related entity (the other entity in the relationship) */
  relatedEntity?: {
    type: EntityType;
    value: string;
  };
  /** Relationship type if applicable */
  relationshipType?: RelationshipType;
}

/**
 * Determine the source type from a sourceId
 */
function inferSourceType(sourceId: string): TimelineSourceType {
  // Calendar event IDs typically contain @ or have specific patterns
  if (sourceId.includes('@google.com') || sourceId.includes('_') && sourceId.length > 30) {
    return 'calendar';
  }
  // Drive file IDs are typically long alphanumeric strings
  if (sourceId.length === 44 || sourceId.startsWith('1')) {
    return 'drive';
  }
  // Task IDs have specific patterns
  if (sourceId.startsWith('task_') || sourceId.startsWith('tasks/')) {
    return 'task';
  }
  // Default to email
  return 'email';
}

/**
 * Determine the action type based on relationship type and source
 */
function inferAction(relationshipType: RelationshipType, sourceType: TimelineSourceType): TimelineAction {
  // Calendar sources
  if (sourceType === 'calendar') {
    return 'met_with';
  }

  // Email sources
  if (sourceType === 'email') {
    switch (relationshipType) {
      case 'WORKS_WITH':
      case 'REPORTS_TO':
      case 'WORKS_FOR':
        return 'emailed';
      case 'WORKS_ON':
      case 'LEADS':
        return 'discussed';
      case 'EXPERT_IN':
      case 'ASSOCIATED_WITH':
        return 'referenced';
      default:
        return 'mentioned';
    }
  }

  // Task sources
  if (sourceType === 'task') {
    return 'assigned_to';
  }

  // Drive sources
  if (sourceType === 'drive') {
    return 'collaborated_on';
  }

  return 'mentioned';
}

/**
 * Get timeline for a specific entity
 */
export async function getEntityTimeline(
  userId: string,
  entityId: string,
  limit: number = 50
): Promise<EntityTimelineEntry[]> {
  // Parse entity ID (format: "type:value")
  const [entityType, ...valueParts] = entityId.split(':');
  const entityValue = valueParts.join(':');

  if (!entityType || !entityValue) {
    console.error(`${LOG_PREFIX} Invalid entity ID format: ${entityId}`);
    return [];
  }

  console.log(`${LOG_PREFIX} Building timeline for ${entityType}: ${entityValue} (limit: ${limit})`);

  try {
    // Get all relationships involving this entity
    const relationships = await getEntityRelationships(
      entityType as EntityType,
      entityValue,
      userId
    );

    console.log(`${LOG_PREFIX} Found ${relationships.length} relationships for timeline`);

    // Convert relationships to timeline entries
    const entries: EntityTimelineEntry[] = relationships.map((rel) => {
      const sourceType = inferSourceType(rel.sourceId);
      const action = inferAction(rel.relationshipType, sourceType);

      // Determine the related entity (the other side of the relationship)
      const isFromEntity =
        rel.fromEntityType === entityType &&
        rel.fromEntityValue.toLowerCase() === entityValue.toLowerCase();

      const relatedEntity = isFromEntity
        ? { type: rel.toEntityType, value: rel.toEntityValue }
        : { type: rel.fromEntityType, value: rel.fromEntityValue };

      return {
        date: new Date(rel.inferredAt),
        source: sourceType,
        sourceId: rel.sourceId,
        action,
        context: rel.evidence || `${action} ${relatedEntity.value}`,
        confidence: rel.confidence,
        relatedEntity,
        relationshipType: rel.relationshipType,
      };
    });

    // Sort by date descending (most recent first)
    entries.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Deduplicate by sourceId (keep first occurrence which is most recent)
    const seen = new Set<string>();
    const deduped = entries.filter((entry) => {
      const key = `${entry.sourceId}:${entry.relatedEntity?.type}:${entry.relatedEntity?.value}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    // Apply limit
    const result = deduped.slice(0, limit);

    console.log(`${LOG_PREFIX} Returning ${result.length} timeline entries`);
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to build entity timeline:`, error);
    return [];
  }
}

/**
 * Get the timestamp when an entity was first seen
 */
export async function getEntityFirstSeen(
  userId: string,
  entityId: string
): Promise<Date | null> {
  const [entityType, ...valueParts] = entityId.split(':');
  const entityValue = valueParts.join(':');

  if (!entityType || !entityValue) {
    return null;
  }

  console.log(`${LOG_PREFIX} Getting first seen date for ${entityType}: ${entityValue}`);

  try {
    const relationships = await getEntityRelationships(
      entityType as EntityType,
      entityValue,
      userId
    );

    if (relationships.length === 0) {
      return null;
    }

    // Find the earliest inferredAt date
    let earliest = new Date();
    for (const rel of relationships) {
      const date = new Date(rel.inferredAt);
      if (date < earliest) {
        earliest = date;
      }
    }

    console.log(`${LOG_PREFIX} First seen: ${earliest.toISOString()}`);
    return earliest;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get first seen date:`, error);
    return null;
  }
}

/**
 * Get the timestamp when an entity was last seen
 */
export async function getEntityLastSeen(
  userId: string,
  entityId: string
): Promise<Date | null> {
  const [entityType, ...valueParts] = entityId.split(':');
  const entityValue = valueParts.join(':');

  if (!entityType || !entityValue) {
    return null;
  }

  console.log(`${LOG_PREFIX} Getting last seen date for ${entityType}: ${entityValue}`);

  try {
    const relationships = await getEntityRelationships(
      entityType as EntityType,
      entityValue,
      userId
    );

    if (relationships.length === 0) {
      return null;
    }

    // Find the most recent inferredAt date
    let latest = new Date(0);
    for (const rel of relationships) {
      const date = new Date(rel.inferredAt);
      if (date > latest) {
        latest = date;
      }
    }

    console.log(`${LOG_PREFIX} Last seen: ${latest.toISOString()}`);
    return latest;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get last seen date:`, error);
    return null;
  }
}

/**
 * Get related entities that appear together with this entity
 */
export async function getRelatedEntities(
  userId: string,
  entityId: string,
  limit: number = 20
): Promise<
  Array<{
    entityType: EntityType;
    entityValue: string;
    coOccurrenceCount: number;
    relationshipTypes: RelationshipType[];
  }>
> {
  const [entityType, ...valueParts] = entityId.split(':');
  const entityValue = valueParts.join(':');

  if (!entityType || !entityValue) {
    return [];
  }

  console.log(`${LOG_PREFIX} Finding related entities for ${entityType}: ${entityValue}`);

  try {
    const relationships = await getEntityRelationships(
      entityType as EntityType,
      entityValue,
      userId
    );

    // Count co-occurrences and track relationship types
    const relatedMap = new Map<
      string,
      {
        entityType: EntityType;
        entityValue: string;
        count: number;
        relationshipTypes: Set<RelationshipType>;
      }
    >();

    for (const rel of relationships) {
      // Get the other entity in the relationship
      const isFromEntity =
        rel.fromEntityType === entityType &&
        rel.fromEntityValue.toLowerCase() === entityValue.toLowerCase();

      const otherType = isFromEntity ? rel.toEntityType : rel.fromEntityType;
      const otherValue = isFromEntity ? rel.toEntityValue : rel.fromEntityValue;
      const key = `${otherType}:${otherValue}`;

      const existing = relatedMap.get(key);
      if (existing) {
        existing.count++;
        existing.relationshipTypes.add(rel.relationshipType);
      } else {
        relatedMap.set(key, {
          entityType: otherType,
          entityValue: otherValue,
          count: 1,
          relationshipTypes: new Set([rel.relationshipType]),
        });
      }
    }

    // Convert to array and sort by co-occurrence count
    const result = Array.from(relatedMap.values())
      .map((item) => ({
        entityType: item.entityType,
        entityValue: item.entityValue,
        coOccurrenceCount: item.count,
        relationshipTypes: Array.from(item.relationshipTypes),
      }))
      .sort((a, b) => b.coOccurrenceCount - a.coOccurrenceCount)
      .slice(0, limit);

    console.log(`${LOG_PREFIX} Found ${result.length} related entities`);
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get related entities:`, error);
    return [];
  }
}

/**
 * Get a summary of an entity's activity
 */
export async function getEntityActivitySummary(
  userId: string,
  entityId: string
): Promise<{
  firstSeen: Date | null;
  lastSeen: Date | null;
  totalInteractions: number;
  interactionsBySource: Record<TimelineSourceType, number>;
  interactionsByMonth: Array<{ month: string; count: number }>;
  topRelatedEntities: Array<{
    entityType: EntityType;
    entityValue: string;
    count: number;
  }>;
}> {
  const [entityType, ...valueParts] = entityId.split(':');
  const entityValue = valueParts.join(':');

  console.log(`${LOG_PREFIX} Building activity summary for ${entityType}: ${entityValue}`);

  const defaultSummary = {
    firstSeen: null,
    lastSeen: null,
    totalInteractions: 0,
    interactionsBySource: {} as Record<TimelineSourceType, number>,
    interactionsByMonth: [] as Array<{ month: string; count: number }>,
    topRelatedEntities: [] as Array<{
      entityType: EntityType;
      entityValue: string;
      count: number;
    }>,
  };

  if (!entityType || !entityValue) {
    return defaultSummary;
  }

  try {
    const relationships = await getEntityRelationships(
      entityType as EntityType,
      entityValue,
      userId
    );

    if (relationships.length === 0) {
      return defaultSummary;
    }

    let firstSeen = new Date();
    let lastSeen = new Date(0);
    const bySource: Record<TimelineSourceType, number> = {
      email: 0,
      calendar: 0,
      task: 0,
      drive: 0,
    };
    const byMonth = new Map<string, number>();
    const relatedCounts = new Map<string, number>();

    for (const rel of relationships) {
      const date = new Date(rel.inferredAt);

      // Track first/last seen
      if (date < firstSeen) firstSeen = date;
      if (date > lastSeen) lastSeen = date;

      // Count by source
      const sourceType = inferSourceType(rel.sourceId);
      bySource[sourceType]++;

      // Count by month
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + 1);

      // Count related entities
      const isFromEntity =
        rel.fromEntityType === entityType &&
        rel.fromEntityValue.toLowerCase() === entityValue.toLowerCase();
      const otherKey = isFromEntity
        ? `${rel.toEntityType}:${rel.toEntityValue}`
        : `${rel.fromEntityType}:${rel.fromEntityValue}`;
      relatedCounts.set(otherKey, (relatedCounts.get(otherKey) || 0) + 1);
    }

    // Format monthly data
    const monthlyData = Array.from(byMonth.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Get top related entities
    const topRelated = Array.from(relatedCounts.entries())
      .map(([key, count]) => {
        const [type, ...value] = key.split(':');
        return {
          entityType: type as EntityType,
          entityValue: value.join(':'),
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      firstSeen,
      lastSeen,
      totalInteractions: relationships.length,
      interactionsBySource: bySource,
      interactionsByMonth: monthlyData,
      topRelatedEntities: topRelated,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to build activity summary:`, error);
    return defaultSummary;
  }
}
