/**
 * Identity Relationships - Phase 2 Entity Resolution
 *
 * Creates SAME_AS relationships between identity entities (user's aliases).
 * When we detect "Bob Matsuoka", "Robert Matsuoka", and "Bob" as the same person,
 * this module creates SAME_AS relationships between them in Weaviate.
 *
 * This enables:
 * - Graph visualization showing identity clusters
 * - Future identity resolution queries
 * - Human-in-the-loop verification of identity matches
 */

import type { Entity } from './types';
import type { InferredRelationship } from '../relationships/types';
import { saveRelationships } from '../weaviate/relationships';
import { calculateMatchScore, MIN_MATCH_THRESHOLD } from './entity-matcher';

const LOG_PREFIX = '[IdentityRelationships]';

/**
 * Create SAME_AS relationships between identity entities
 *
 * For each pair of identity entities (entities tagged with isIdentity=true),
 * creates a SAME_AS relationship with confidence based on the match score.
 *
 * @param userId - User ID for storing relationships
 * @param identityEntities - Entities tagged as identity (isIdentity=true)
 * @returns Number of relationships created
 */
export async function createIdentityRelationships(
  userId: string,
  identityEntities: Entity[]
): Promise<number> {
  if (identityEntities.length < 2) {
    console.log(`${LOG_PREFIX} Need at least 2 identity entities to create relationships (got ${identityEntities.length})`);
    return 0;
  }

  console.log(`${LOG_PREFIX} Creating SAME_AS relationships for ${identityEntities.length} identity entities`);

  const relationships: InferredRelationship[] = [];

  // Compare each pair of identity entities
  for (let i = 0; i < identityEntities.length; i++) {
    for (let j = i + 1; j < identityEntities.length; j++) {
      const entity1 = identityEntities[i];
      const entity2 = identityEntities[j];

      // Only create relationships between entities of the same type
      if (entity1.type !== entity2.type) {
        continue;
      }

      // Calculate match confidence between the two entities
      const { confidence, reason } = calculateMatchScore(entity1, entity2);

      // Only create relationship if confidence is above threshold
      // For identity entities, we use a lower threshold since they've already
      // been identified as the same person through other means
      const identityThreshold = Math.max(MIN_MATCH_THRESHOLD - 0.2, 0.5);

      if (confidence >= identityThreshold) {
        relationships.push({
          fromEntityType: entity1.type,
          fromEntityValue: entity1.value,
          toEntityType: entity2.type,
          toEntityValue: entity2.value,
          relationshipType: 'SAME_AS',
          confidence: Math.max(confidence, entity1.matchConfidence ?? 0.9, entity2.matchConfidence ?? 0.9),
          evidence: `Identity alias match: ${reason}`,
          sourceId: 'identity-resolution',
          inferredAt: new Date().toISOString(),
          userId,
          // SAME_AS relationships are always active (identity doesn't change)
          status: 'active',
        });

        console.log(
          `${LOG_PREFIX} Found SAME_AS: "${entity1.value}" <-> "${entity2.value}" (confidence: ${confidence.toFixed(3)}, reason: ${reason})`
        );
      }
    }
  }

  if (relationships.length === 0) {
    console.log(`${LOG_PREFIX} No SAME_AS relationships to create`);
    return 0;
  }

  // Save relationships to Weaviate (handles deduplication internally)
  const savedCount = await saveRelationships(relationships, userId);

  console.log(`${LOG_PREFIX} Created ${savedCount} SAME_AS relationships (${relationships.length - savedCount} duplicates skipped)`);

  return savedCount;
}

/**
 * Collect identity entities from a list of entities
 *
 * Filters entities that have isIdentity=true flag set.
 *
 * @param entities - All entities to filter
 * @returns Entities with isIdentity=true
 */
export function collectIdentityEntities(entities: Entity[]): Entity[] {
  return entities.filter((entity) => entity.isIdentity === true);
}

/**
 * Process entities and create identity relationships
 *
 * Convenience function that combines collectIdentityEntities and createIdentityRelationships.
 * Call this after applying post-filters to handle identity relationship creation.
 *
 * @param userId - User ID for storing relationships
 * @param entities - All entities (after post-filtering)
 * @returns Number of SAME_AS relationships created
 */
export async function processIdentityRelationships(
  userId: string,
  entities: Entity[]
): Promise<number> {
  const identityEntities = collectIdentityEntities(entities);

  if (identityEntities.length === 0) {
    console.log(`${LOG_PREFIX} No identity entities found in ${entities.length} total entities`);
    return 0;
  }

  console.log(`${LOG_PREFIX} Found ${identityEntities.length} identity entities out of ${entities.length} total`);

  return createIdentityRelationships(userId, identityEntities);
}
