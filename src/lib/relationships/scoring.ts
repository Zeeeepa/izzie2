/**
 * Relationship Scoring Service
 *
 * Calculates relationship strength scores based on interaction patterns.
 * Scores are computed from email frequency, calendar frequency, recency, and sentiment.
 */

import { getAllRelationships, getEntityRelationships } from '../weaviate/relationships';
import { listEntitiesByType } from '../weaviate/entities';
import type { InferredRelationship, RelationshipType } from './types';
import type { EntityType } from '../extraction/types';

const LOG_PREFIX = '[Relationship Scoring]';

/**
 * Factors contributing to relationship strength
 */
export interface RelationshipFactors {
  /** Emails per month involving this entity */
  emailFrequency: number;
  /** Calendar events per month with this entity */
  calendarFrequency: number;
  /** Days since last interaction (lower = better) */
  recency: number;
  /** Average sentiment score (0-1) */
  sentiment: number;
}

/**
 * Relationship score for an entity
 */
export interface RelationshipScore {
  entityId: string;
  entityType: EntityType;
  entityValue: string;
  /** Overall strength score (0-1) */
  strength: number;
  /** Timestamp of last interaction */
  lastInteraction: Date;
  /** Total number of interactions */
  interactionCount: number;
  /** Breakdown of scoring factors */
  factors: RelationshipFactors;
}

/**
 * Configuration for scoring calculations
 */
interface ScoringConfig {
  /** Weight for email frequency factor (default: 0.3) */
  emailWeight: number;
  /** Weight for calendar frequency factor (default: 0.3) */
  calendarWeight: number;
  /** Weight for recency factor (default: 0.25) */
  recencyWeight: number;
  /** Weight for sentiment factor (default: 0.15) */
  sentimentWeight: number;
  /** Half-life for recency decay in days (default: 30) */
  recencyHalfLifeDays: number;
  /** Maximum email frequency to normalize against (default: 20/month) */
  maxEmailFrequency: number;
  /** Maximum calendar frequency to normalize against (default: 10/month) */
  maxCalendarFrequency: number;
}

const DEFAULT_CONFIG: ScoringConfig = {
  emailWeight: 0.3,
  calendarWeight: 0.3,
  recencyWeight: 0.25,
  sentimentWeight: 0.15,
  recencyHalfLifeDays: 30,
  maxEmailFrequency: 20,
  maxCalendarFrequency: 10,
};

/**
 * Calculate exponential decay score based on recency
 * Uses half-life decay: score = 0.5^(days / halfLife)
 */
function calculateRecencyScore(daysSinceLastInteraction: number, halfLifeDays: number): number {
  return Math.pow(0.5, daysSinceLastInteraction / halfLifeDays);
}

/**
 * Normalize a frequency value to 0-1 range
 */
function normalizeFrequency(frequency: number, maxFrequency: number): number {
  return Math.min(frequency / maxFrequency, 1);
}

/**
 * Extract source type from sourceId
 * Returns 'email' or 'calendar' based on ID pattern
 */
function getSourceType(sourceId: string): 'email' | 'calendar' | 'unknown' {
  // Gmail message IDs are typically alphanumeric
  // Calendar event IDs often contain @ or specific patterns
  if (sourceId.includes('@') || sourceId.includes('_')) {
    return 'calendar';
  }
  // Default to email for other patterns
  return 'email';
}

/**
 * Calculate relationship strength for a single entity
 */
export async function calculateRelationshipStrength(
  userId: string,
  entityId: string,
  config: Partial<ScoringConfig> = {}
): Promise<RelationshipScore | null> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Parse entity ID (format: "type:value")
  const [entityType, ...valueParts] = entityId.split(':');
  const entityValue = valueParts.join(':');

  if (!entityType || !entityValue) {
    console.error(`${LOG_PREFIX} Invalid entity ID format: ${entityId}`);
    return null;
  }

  console.log(`${LOG_PREFIX} Calculating strength for ${entityType}: ${entityValue}`);

  try {
    // Get all relationships involving this entity
    const relationships = await getEntityRelationships(
      entityType as EntityType,
      entityValue,
      userId
    );

    if (relationships.length === 0) {
      console.log(`${LOG_PREFIX} No relationships found for entity`);
      return {
        entityId,
        entityType: entityType as EntityType,
        entityValue,
        strength: 0,
        lastInteraction: new Date(0),
        interactionCount: 0,
        factors: {
          emailFrequency: 0,
          calendarFrequency: 0,
          recency: Infinity,
          sentiment: 0.5, // Neutral default
        },
      };
    }

    // Calculate metrics from relationships
    let emailCount = 0;
    let calendarCount = 0;
    let latestInteraction = new Date(0);
    let totalConfidence = 0;

    for (const rel of relationships) {
      // Count by source type
      const sourceType = getSourceType(rel.sourceId);
      if (sourceType === 'email') {
        emailCount++;
      } else if (sourceType === 'calendar') {
        calendarCount++;
      }

      // Track latest interaction
      const inferredDate = new Date(rel.inferredAt);
      if (inferredDate > latestInteraction) {
        latestInteraction = inferredDate;
      }

      // Accumulate confidence as sentiment proxy
      totalConfidence += rel.confidence;
    }

    // Calculate time-based metrics
    const now = new Date();
    const daysSinceLastInteraction = Math.max(
      0,
      (now.getTime() - latestInteraction.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get the time span of interactions for frequency calculation
    const oldestInteraction = relationships.reduce(
      (oldest, rel) => {
        const date = new Date(rel.inferredAt);
        return date < oldest ? date : oldest;
      },
      new Date()
    );

    const timeSpanMonths = Math.max(
      1,
      (now.getTime() - oldestInteraction.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );

    // Calculate frequencies (per month)
    const emailFrequency = emailCount / timeSpanMonths;
    const calendarFrequency = calendarCount / timeSpanMonths;

    // Calculate factor scores
    const normalizedEmailFreq = normalizeFrequency(emailFrequency, cfg.maxEmailFrequency);
    const normalizedCalendarFreq = normalizeFrequency(calendarFrequency, cfg.maxCalendarFrequency);
    const recencyScore = calculateRecencyScore(daysSinceLastInteraction, cfg.recencyHalfLifeDays);
    const sentimentScore = relationships.length > 0 ? totalConfidence / relationships.length : 0.5;

    // Calculate weighted overall strength
    const strength =
      normalizedEmailFreq * cfg.emailWeight +
      normalizedCalendarFreq * cfg.calendarWeight +
      recencyScore * cfg.recencyWeight +
      sentimentScore * cfg.sentimentWeight;

    console.log(
      `${LOG_PREFIX} Calculated strength: ${strength.toFixed(3)} ` +
        `(email: ${normalizedEmailFreq.toFixed(2)}, calendar: ${normalizedCalendarFreq.toFixed(2)}, ` +
        `recency: ${recencyScore.toFixed(2)}, sentiment: ${sentimentScore.toFixed(2)})`
    );

    return {
      entityId,
      entityType: entityType as EntityType,
      entityValue,
      strength,
      lastInteraction: latestInteraction,
      interactionCount: relationships.length,
      factors: {
        emailFrequency,
        calendarFrequency,
        recency: daysSinceLastInteraction,
        sentiment: sentimentScore,
      },
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to calculate relationship strength:`, error);
    return null;
  }
}

/**
 * Get top relationships by strength
 * Optionally filter by entity type
 */
export async function getTopRelationships(
  userId: string,
  limit: number = 10,
  entityType?: EntityType,
  config: Partial<ScoringConfig> = {}
): Promise<RelationshipScore[]> {
  console.log(
    `${LOG_PREFIX} Getting top ${limit} relationships` +
      (entityType ? ` for type: ${entityType}` : '')
  );

  try {
    // Get all relationships
    const relationships = await getAllRelationships(userId, 5000);

    if (relationships.length === 0) {
      console.log(`${LOG_PREFIX} No relationships found`);
      return [];
    }

    // Build unique entity set from relationships
    const entitySet = new Set<string>();
    for (const rel of relationships) {
      // Add both from and to entities
      const fromId = `${rel.fromEntityType}:${rel.fromEntityValue}`;
      const toId = `${rel.toEntityType}:${rel.toEntityValue}`;

      if (!entityType || rel.fromEntityType === entityType) {
        entitySet.add(fromId);
      }
      if (!entityType || rel.toEntityType === entityType) {
        entitySet.add(toId);
      }
    }

    console.log(`${LOG_PREFIX} Found ${entitySet.size} unique entities`);

    // Calculate scores for each entity
    const scores: RelationshipScore[] = [];

    for (const entityId of entitySet) {
      const score = await calculateRelationshipStrength(userId, entityId, config);
      if (score && score.strength > 0) {
        scores.push(score);
      }
    }

    // Sort by strength descending
    scores.sort((a, b) => b.strength - a.strength);

    // Return top N
    const result = scores.slice(0, limit);
    console.log(`${LOG_PREFIX} Returning ${result.length} top relationships`);

    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get top relationships:`, error);
    return [];
  }
}

/**
 * Batch update relationship scores for a user
 * Calculates scores for all entities with relationships
 */
export async function updateRelationshipScores(
  userId: string,
  config: Partial<ScoringConfig> = {}
): Promise<{
  updated: number;
  scores: RelationshipScore[];
}> {
  console.log(`${LOG_PREFIX} Batch updating relationship scores for user: ${userId}`);

  try {
    // Get all relationships
    const relationships = await getAllRelationships(userId, 10000);

    if (relationships.length === 0) {
      console.log(`${LOG_PREFIX} No relationships to score`);
      return { updated: 0, scores: [] };
    }

    // Build unique entity set
    const entitySet = new Set<string>();
    for (const rel of relationships) {
      entitySet.add(`${rel.fromEntityType}:${rel.fromEntityValue}`);
      entitySet.add(`${rel.toEntityType}:${rel.toEntityValue}`);
    }

    console.log(`${LOG_PREFIX} Updating scores for ${entitySet.size} entities`);

    // Calculate scores for each entity
    const scores: RelationshipScore[] = [];

    for (const entityId of entitySet) {
      const score = await calculateRelationshipStrength(userId, entityId, config);
      if (score) {
        scores.push(score);
      }
    }

    // Sort by strength descending
    scores.sort((a, b) => b.strength - a.strength);

    console.log(`${LOG_PREFIX} Updated ${scores.length} relationship scores`);

    return {
      updated: scores.length,
      scores,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to update relationship scores:`, error);
    return { updated: 0, scores: [] };
  }
}

/**
 * Get relationship score summary statistics
 */
export async function getRelationshipScoreStats(userId: string): Promise<{
  totalEntities: number;
  avgStrength: number;
  strongRelationships: number; // strength > 0.7
  mediumRelationships: number; // strength 0.3-0.7
  weakRelationships: number; // strength < 0.3
  topEntityTypes: Record<EntityType, number>;
}> {
  const { scores } = await updateRelationshipScores(userId);

  const stats = {
    totalEntities: scores.length,
    avgStrength: 0,
    strongRelationships: 0,
    mediumRelationships: 0,
    weakRelationships: 0,
    topEntityTypes: {} as Record<EntityType, number>,
  };

  if (scores.length === 0) {
    return stats;
  }

  let totalStrength = 0;
  for (const score of scores) {
    totalStrength += score.strength;

    if (score.strength > 0.7) {
      stats.strongRelationships++;
    } else if (score.strength >= 0.3) {
      stats.mediumRelationships++;
    } else {
      stats.weakRelationships++;
    }

    // Count by entity type
    stats.topEntityTypes[score.entityType] =
      (stats.topEntityTypes[score.entityType] || 0) + 1;
  }

  stats.avgStrength = totalStrength / scores.length;

  return stats;
}
