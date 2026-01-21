/**
 * Direct Bulk Relationship Inference Script
 *
 * Bypasses HTTP API and calls inference functions directly
 * This allows running relationship inference without browser authentication
 *
 * Run with: npx tsx scripts/run-bulk-inference-direct.ts
 */

import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(process.cwd(), '.env.local') });

import { dbClient } from '../src/lib/db/index.js';
import { users } from '../src/lib/db/schema.js';
import { inferRelationships } from '../src/lib/relationships/inference.js';
import { saveRelationships, getAllRelationships, getRelationshipStats } from '../src/lib/weaviate/relationships.js';
import { listEntitiesByType } from '../src/lib/weaviate/entities.js';
import type { Entity } from '../src/lib/extraction/types.js';

const LOG_PREFIX = '[Bulk Inference Direct]';

// Types for entity data from Weaviate
interface WeaviateEntity {
  type: string;
  value: string;
  normalized: string;
  confidence: number;
  source: string;
  sourceId: string;
  context?: string;
}

async function getUserId(): Promise<string> {
  const db = dbClient.getDb();
  const [user] = await db.select().from(users).limit(1);

  if (!user) {
    throw new Error('No users found in database. Please create a user first.');
  }

  console.log(`${LOG_PREFIX} Using user: ${user.email} (${user.id})`);
  return user.id;
}

async function runBulkInference(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Direct Bulk Relationship Inference');
  console.log('='.repeat(60));

  const userId = await getUserId();
  const startTime = Date.now();

  // Configuration
  const limit = 200;
  const entityTypes = ['person', 'company', 'project', 'topic', 'event'];
  const maxSources = 20;

  let totalRelationships = 0;
  let totalCost = 0;
  const errors: string[] = [];

  // Get existing stats before inference
  console.log(`\n${LOG_PREFIX} Getting current relationship stats...`);
  try {
    const beforeStats = await getRelationshipStats(userId);
    console.log(`${LOG_PREFIX} Existing relationships: ${beforeStats.total}`);
  } catch (e) {
    console.log(`${LOG_PREFIX} Could not get existing stats: ${e}`);
  }

  // Fetch entities of specified types
  console.log(`\n${LOG_PREFIX} Fetching entities (types: ${entityTypes.join(', ')}, limit: ${limit})...`);
  const allEntities: WeaviateEntity[] = [];

  for (const type of entityTypes) {
    try {
      const entities = await listEntitiesByType(userId, type, limit);
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
      console.log(`${LOG_PREFIX} - ${type}: ${entities.length} entities`);
    } catch (err) {
      console.error(`${LOG_PREFIX} Error fetching ${type} entities:`, err);
      errors.push(`Failed to fetch ${type} entities`);
    }
  }

  console.log(`\n${LOG_PREFIX} Total entities fetched: ${allEntities.length}`);

  if (allEntities.length === 0) {
    console.log(`${LOG_PREFIX} No entities found to process`);
    return;
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

  console.log(`${LOG_PREFIX} Grouped into ${entityGroups.size} sources`);

  // Process each group
  console.log(`\n${LOG_PREFIX} Processing up to ${maxSources} sources...`);
  let processedSources = 0;
  let skippedSources = 0;

  for (const [sourceId, entities] of entityGroups) {
    if (processedSources >= maxSources) break;

    // Skip groups with too few entities
    if (entities.length < 2) {
      skippedSources++;
      continue;
    }

    try {
      // Build context from entity contexts
      const contextParts = entities
        .filter((e) => e.context)
        .map((e) => e.context)
        .slice(0, 5);
      const content =
        contextParts.length > 0
          ? contextParts.join('\n\n')
          : `Entities from source ${sourceId}: ${entities.map((e) => `${e.type}: ${e.value}`).join(', ')}`;

      // Convert to Entity type for inference
      const inferenceEntities: Entity[] = entities.map((e) => ({
        type: e.type as Entity['type'],
        value: e.value,
        normalized: e.normalized,
        confidence: e.confidence,
        source: e.source as Entity['source'],
      }));

      console.log(`\n${LOG_PREFIX} [${processedSources + 1}/${maxSources}] Processing source: ${sourceId.substring(0, 30)}...`);
      console.log(`${LOG_PREFIX}   Entities: ${entities.length} (${entities.map(e => e.type).filter((v, i, a) => a.indexOf(v) === i).join(', ')})`);

      const result = await inferRelationships(inferenceEntities, content, sourceId, userId);

      console.log(`${LOG_PREFIX}   Inferred: ${result.relationships.length} relationships`);

      if (result.relationships.length > 0) {
        await saveRelationships(result.relationships, userId);
        totalRelationships += result.relationships.length;

        // Log some relationship details
        for (const rel of result.relationships.slice(0, 3)) {
          console.log(`${LOG_PREFIX}     - ${rel.fromEntityValue} --[${rel.relationshipType}]--> ${rel.toEntityValue} (${(rel.confidence * 100).toFixed(0)}%)`);
        }
        if (result.relationships.length > 3) {
          console.log(`${LOG_PREFIX}     ... and ${result.relationships.length - 3} more`);
        }
      }
      totalCost += result.tokenCost;
      processedSources++;
    } catch (err) {
      console.error(`${LOG_PREFIX} Error processing source ${sourceId}:`, err);
      errors.push(`Failed to process source: ${sourceId.substring(0, 30)}`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const processingTime = Date.now() - startTime;

  // Get stats after inference
  console.log(`\n${LOG_PREFIX} Getting updated relationship stats...`);
  try {
    const afterStats = await getRelationshipStats(userId);
    console.log(`${LOG_PREFIX} Total relationships in database: ${afterStats.total}`);
  } catch (e) {
    console.log(`${LOG_PREFIX} Could not get updated stats: ${e}`);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('INFERENCE SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Relationships Inferred: ${totalRelationships}`);
  console.log(`Sources Processed: ${processedSources} / ${entityGroups.size}`);
  console.log(`Sources Skipped (< 2 entities): ${skippedSources}`);
  console.log(`Entities Analyzed: ${allEntities.length}`);
  console.log(`Processing Time: ${(processingTime / 1000).toFixed(1)}s`);
  console.log(`Estimated Cost: $${totalCost.toFixed(4)}`);

  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.forEach((err) => console.log(`  - ${err}`));
  }

  console.log('\n' + '='.repeat(60));
}

// Run the inference
runBulkInference()
  .catch((error) => {
    console.error('\nFATAL ERROR:', error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
