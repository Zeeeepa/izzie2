/**
 * Test Entities API Directly
 *
 * Bypass HTTP and call the entity functions directly with the user ID
 */

import { config } from 'dotenv';
import { listEntitiesByType } from '../src/lib/weaviate/entities';
import type { EntityType } from '../src/lib/extraction/types';
import { closeWeaviateClient } from '../src/lib/weaviate/client';

// Load environment variables
config({ path: '.env.local' });

const VALID_TYPES: EntityType[] = [
  'person',
  'company',
  'project',
  'date',
  'topic',
  'location',
  'action_item',
];

async function main() {
  console.log('=== Testing Entity Listing Directly ===\n');

  // Test user ID for development - not a secret  pragma: allowlist secret
  const userId = 'tlHWmrogZXPR91lqdGO1fXM02j92rVDF';
  const limit = 100;

  try {
    const stats: Record<string, number> = {};

    console.log(`Fetching entities for user: ${userId}\n`);

    for (const entityType of VALID_TYPES) {
      try {
        console.log(`Fetching ${entityType}...`);
        const entities = await listEntitiesByType(userId, entityType, limit);

        stats[entityType] = entities.length;

        if (entities.length > 0) {
          console.log(`  ✓ Found ${entities.length} ${entityType} entities`);
          console.log(`    Sample: "${entities[0].value}" (confidence: ${entities[0].confidence})`);
        } else {
          console.log(`  ✗ No ${entityType} entities found`);
        }
      } catch (error) {
        console.error(`  ✗ Error fetching ${entityType}:`, error instanceof Error ? error.message : String(error));
        stats[entityType] = 0;
      }
    }

    console.log('\n=== Statistics ===');
    console.log(JSON.stringify(stats, null, 2));

    const totalEntities = Object.values(stats).reduce((sum, count) => sum + count, 0);
    console.log(`\nTotal entities: ${totalEntities}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await closeWeaviateClient();
  }
}

main();
