/**
 * Test script to verify entities API fix
 * Tests that entities are returned without userId filtering (single-user mode)
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local explicitly
const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath });

console.log('[Test Entities API] Loaded environment from:', envPath);
console.log('[Test Entities API] WEAVIATE_URL:', process.env.WEAVIATE_URL ? 'SET' : 'NOT SET');
console.log('[Test Entities API] WEAVIATE_API_KEY:', process.env.WEAVIATE_API_KEY ? 'SET' : 'NOT SET');

import { listEntitiesByType } from '@/lib/weaviate/entities';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Test Entities API]';

async function testEntitiesAPI() {
  console.log(`${LOG_PREFIX} Testing entities API fix...`);
  console.log(`${LOG_PREFIX} Single-user mode: userId filter should be skipped\n`);

  const entityTypes: EntityType[] = ['person', 'company', 'project', 'action_item'];

  let totalEntities = 0;
  const results: Record<string, number> = {};

  for (const entityType of entityTypes) {
    try {
      console.log(`${LOG_PREFIX} Testing ${entityType} entities...`);

      // Call with undefined userId (single-user mode)
      const entities = await listEntitiesByType(undefined, entityType, 10);

      results[entityType] = entities.length;
      totalEntities += entities.length;

      console.log(`${LOG_PREFIX} ✅ ${entityType}: ${entities.length} entities found`);

      // Show sample entities
      if (entities.length > 0) {
        console.log(`${LOG_PREFIX}    Sample: ${entities.slice(0, 3).map(e => e.value).join(', ')}`);
      }

    } catch (error) {
      console.error(`${LOG_PREFIX} ❌ Error fetching ${entityType} entities:`, error);
      results[entityType] = 0;
    }
  }

  console.log(`\n${LOG_PREFIX} ========== SUMMARY ==========`);
  console.log(`${LOG_PREFIX} Total entities found: ${totalEntities}`);
  console.log(`${LOG_PREFIX} Breakdown:`);

  for (const [type, count] of Object.entries(results)) {
    console.log(`${LOG_PREFIX}   - ${type}: ${count}`);
  }

  if (totalEntities === 0) {
    console.log(`\n${LOG_PREFIX} ⚠️  WARNING: No entities found!`);
    console.log(`${LOG_PREFIX} This could mean:`);
    console.log(`${LOG_PREFIX}   1. Weaviate is empty (no data has been extracted yet)`);
    console.log(`${LOG_PREFIX}   2. Weaviate connection issue`);
    console.log(`${LOG_PREFIX}   3. Collections don't exist yet`);
    return false;
  } else {
    console.log(`\n${LOG_PREFIX} ✅ SUCCESS: API returns entities without userId filter`);
    console.log(`${LOG_PREFIX} The fix is working correctly!`);
    return true;
  }
}

// Run the test
testEntitiesAPI()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error(`${LOG_PREFIX} Fatal error:`, error);
    process.exit(1);
  });
