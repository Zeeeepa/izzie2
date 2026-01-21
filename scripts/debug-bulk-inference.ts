/**
 * Debug Bulk Relationship Inference
 *
 * Bypasses API authentication to directly run diagnostics on entity grouping
 * and relationship inference.
 *
 * Run with: npx tsx scripts/debug-bulk-inference.ts
 */

import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(process.cwd(), '.env.local') });

import { dbClient } from '../src/lib/db/index.js';
import { users } from '../src/lib/db/schema.js';
import { listEntitiesByType } from '../src/lib/weaviate/entities.js';
import { inferRelationships } from '../src/lib/relationships/inference.js';
import type { Entity, EntityType } from '../src/lib/extraction/types.js';

const LOG_PREFIX = '[Debug Bulk Inference]';

interface WeaviateEntity {
  type: string;
  value: string;
  normalized: string;
  confidence: number;
  source: string;
  sourceId: string;
  context?: string;
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Debug Bulk Relationship Inference');
  console.log('='.repeat(60));

  // Get first user
  const db = dbClient.getDb();
  const [user] = await db.select().from(users).limit(1);

  if (!user) {
    console.error('No users found in database');
    process.exit(1);
  }

  console.log(`\nUser: ${user.email} (${user.id})`);

  const entityTypes: EntityType[] = ['person', 'company', 'project', 'topic'];
  const limit = 200;

  // Fetch entities of specified types
  const allEntities: WeaviateEntity[] = [];
  const entitiesPerType: Record<string, number> = {};

  console.log('\n--- Fetching Entities ---\n');

  for (const type of entityTypes) {
    try {
      const entities = await listEntitiesByType(user.id, type, limit);
      entitiesPerType[type] = entities.length;
      console.log(`[DIAG] Fetched ${entities.length} ${type} entities`);

      // Log first entity of each type for debugging
      if (entities.length > 0) {
        const sample = entities[0];
        console.log(`[DIAG] Sample ${type} entity:`, {
          value: sample.value,
          sourceId: sample.sourceId,
          hasContext: !!sample.context,
          contextLength: sample.context?.length || 0,
        });
      }

      allEntities.push(
        ...entities.map((e: any) => ({
          type: e.type || type,
          value: e.value,
          normalized: e.normalized,
          confidence: e.confidence,
          source: e.source,
          sourceId: e.sourceId,
          context: e.context,
        }))
      );
    } catch (err) {
      console.error(`Error fetching ${type} entities:`, err);
    }
  }

  console.log(`\n${LOG_PREFIX} Fetched ${allEntities.length} entities total`);
  console.log(`[DIAG] Entities per type:`, entitiesPerType);

  if (allEntities.length === 0) {
    console.log('\nNo entities found! Nothing to infer.');
    process.exit(0);
  }

  // Group entities by sourceId
  const entityGroups = new Map<string, WeaviateEntity[]>();
  for (const entity of allEntities) {
    const sourceId = entity.sourceId || 'unknown';
    if (!entityGroups.has(sourceId)) {
      entityGroups.set(sourceId, []);
    }
    entityGroups.get(sourceId)!.push(entity);
  }

  // Diagnostic: Analyze unique sourceIds
  const uniqueSourceIds = new Set(allEntities.map((e) => e.sourceId || 'unknown'));
  console.log(`\n[DIAG] Unique sourceIds: ${uniqueSourceIds.size}`);

  // Diagnostic: Group size distribution
  const groupSizes: Record<string, number> = {};
  let eligibleGroups = 0;
  let skippedSingleEntity = 0;

  for (const [sourceId, entities] of entityGroups) {
    const size = entities.length;
    const sizeKey = size >= 5 ? '5+' : String(size);
    groupSizes[sizeKey] = (groupSizes[sizeKey] || 0) + 1;

    if (size >= 2) {
      eligibleGroups++;
    } else {
      skippedSingleEntity++;
    }
  }

  console.log(`\n${LOG_PREFIX} Grouped into ${entityGroups.size} sources`);
  console.log(`[DIAG] Group size distribution:`, groupSizes);
  console.log(
    `[DIAG] Eligible groups (>=2 entities): ${eligibleGroups}, Skipped (<2 entities): ${skippedSingleEntity}`
  );

  // Diagnostic: Show sample of sourceIds and their entities
  console.log('\n--- Sample Groups ---\n');
  const sampleGroups = Array.from(entityGroups.entries())
    .filter(([_, entities]) => entities.length >= 2)
    .slice(0, 5);

  for (const [sourceId, entities] of sampleGroups) {
    console.log(`\nSource: ${sourceId} (${entities.length} entities)`);
    for (const e of entities.slice(0, 5)) {
      console.log(`  - ${e.type}: "${e.value}" (conf: ${e.confidence})`);
    }
    if (entities.length > 5) {
      console.log(`  ... and ${entities.length - 5} more`);
    }
  }

  // Try inference on first eligible group
  if (eligibleGroups > 0) {
    console.log('\n--- Testing Inference on First Eligible Group ---\n');

    const firstEligible = Array.from(entityGroups.entries()).find(
      ([_, entities]) => entities.length >= 2
    );

    if (firstEligible) {
      const [sourceId, entities] = firstEligible;

      // Build context from entity contexts
      const contextParts = entities
        .filter((e) => e.context)
        .map((e) => e.context)
        .slice(0, 5);
      const content =
        contextParts.length > 0
          ? contextParts.join('\n\n')
          : `Entities from source ${sourceId}: ${entities.map((e) => `${e.type}: ${e.value}`).join(', ')}`;

      console.log(`Source ID: ${sourceId}`);
      console.log(`Entities: ${entities.length}`);
      console.log(`Context parts available: ${contextParts.length}`);
      console.log(`Content length: ${content.length} chars`);
      console.log(`\nContent preview (first 500 chars):`);
      console.log(content.substring(0, 500));

      // Convert to Entity type for inference
      const inferenceEntities: Entity[] = entities.map((e) => ({
        type: e.type as Entity['type'],
        value: e.value,
        normalized: e.normalized,
        confidence: e.confidence,
        source: e.source as Entity['source'],
      }));

      console.log('\n[DIAG] Running inference...');

      try {
        const result = await inferRelationships(inferenceEntities, content, sourceId, user.id);

        console.log(`\n[DIAG] Inference result:`);
        console.log(`  - Relationships found: ${result.relationships.length}`);
        console.log(`  - Processing time: ${result.processingTime}ms`);
        console.log(`  - Token cost: ${result.tokenCost}`);

        if (result.relationships.length > 0) {
          console.log('\n  Relationships:');
          for (const rel of result.relationships) {
            console.log(
              `    ${rel.fromEntityType}: "${rel.fromEntityValue}" -[${rel.relationshipType}]-> ${rel.toEntityType}: "${rel.toEntityValue}"`
            );
            console.log(`      Confidence: ${rel.confidence}, Evidence: ${rel.evidence?.substring(0, 100)}`);
          }
        } else {
          console.log('\n  No relationships inferred from this group.');
        }
      } catch (err) {
        console.error('\nInference failed:', err);
      }
    }
  } else {
    console.log('\n[DIAG] No eligible groups found (all groups have < 2 entities)');
    console.log('[DIAG] This is why 0 relationships are being found!');
    console.log('[DIAG] Each entity seems to have a unique sourceId.');

    // Show all sourceIds and their single entities
    console.log('\n--- All Single-Entity Groups ---\n');
    let count = 0;
    for (const [sourceId, entities] of entityGroups) {
      if (count >= 10) {
        console.log(`... and ${entityGroups.size - 10} more single-entity groups`);
        break;
      }
      const e = entities[0];
      console.log(`${sourceId}: ${e.type} - "${e.value}"`);
      count++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Diagnostic Summary');
  console.log('='.repeat(60));
  console.log(`Total entities fetched: ${allEntities.length}`);
  console.log(`Unique sources: ${entityGroups.size}`);
  console.log(`Eligible groups (>=2 entities): ${eligibleGroups}`);
  console.log(`Groups skipped (single entity): ${skippedSingleEntity}`);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
