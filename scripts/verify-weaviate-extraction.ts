/**
 * Verify Weaviate Extraction Results
 *
 * Checks entity counts in Weaviate collections after extraction.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { getWeaviateClient } from '@/lib/weaviate/client';
import { COLLECTIONS } from '@/lib/weaviate/schema';

const LOG_PREFIX = '[VerifyWeaviate]';

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${LOG_PREFIX} Weaviate Extraction Verification`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    const client = await getWeaviateClient();

    console.log(`${LOG_PREFIX} Fetching entity counts from Weaviate...\n`);

    let totalEntities = 0;

    for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
      try {
        const exists = await client.collections.exists(collectionName);
        if (!exists) {
          console.log(`${LOG_PREFIX} ❌ Collection '${collectionName}' does not exist`);
          continue;
        }

        const collection = client.collections.get(collectionName);
        const result = await collection.aggregate.overAll();
        const count = result.totalCount || 0;

        console.log(`${LOG_PREFIX} ✅ ${entityType.padEnd(12)} (${collectionName.padEnd(12)}): ${count} entities`);
        totalEntities += count;
      } catch (error) {
        console.error(`${LOG_PREFIX} ❌ Failed to check collection '${collectionName}':`, error);
      }
    }

    console.log(`\n${LOG_PREFIX} ${'='.repeat(60)}`);
    console.log(`${LOG_PREFIX} Total entities: ${totalEntities}`);
    console.log(`${LOG_PREFIX} ${'='.repeat(60)}\n`);

    process.exit(0);
  } catch (error) {
    console.error(`\n${LOG_PREFIX} ❌ Fatal error:`, error);
    process.exit(1);
  }
}

main();
