/**
 * Verify Weaviate Collections
 *
 * Checks all entity collections and counts objects in each
 */

import { config } from 'dotenv';
import { getWeaviateClient, closeWeaviateClient } from '../src/lib/weaviate/client';
import { COLLECTIONS } from '../src/lib/weaviate/schema';

// Load environment variables
config({ path: '.env.local' });

async function main() {
  console.log('=== Verifying Weaviate Collections ===\n');

  try {
    const client = await getWeaviateClient();

    // Get all collections
    const allCollections = await client.collections.listAll();
    console.log(`Total collections: ${allCollections.length}\n`);

    // Check entity collections
    console.log('Entity Collections:');
    console.log('===================');

    let totalEntities = 0;

    for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
      try {
        const collection = client.collections.get(collectionName);
        const aggregate = await collection.aggregate.overAll();

        const count = aggregate.totalCount || 0;
        totalEntities += count;

        console.log(`${collectionName.padEnd(15)} : ${count.toString().padStart(6)} entities`);
      } catch (error) {
        console.log(`${collectionName.padEnd(15)} : ERROR - ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log('-------------------');
    console.log(`Total             : ${totalEntities.toString().padStart(6)} entities\n`);

    // Check Memory collection
    try {
      const memoryCollection = client.collections.get('Memory');
      const memoryAggregate = await memoryCollection.aggregate.overAll();
      const memoryCount = memoryAggregate.totalCount || 0;
      console.log(`Memory collection : ${memoryCount} items\n`);
    } catch (error) {
      console.log(`Memory collection : ERROR - ${error instanceof Error ? error.message : String(error)}\n`);
    }

    // Sample a few entities from each collection
    console.log('\n=== Sample Entities ===\n');

    for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
      try {
        const collection = client.collections.get(collectionName);
        const result = await collection.query.fetchObjects({
          limit: 2,
        });

        if (result.objects.length > 0) {
          console.log(`${collectionName}:`);
          result.objects.forEach((obj, idx) => {
            const props = obj.properties as any;
            console.log(`  ${idx + 1}. "${props.value}" (confidence: ${props.confidence?.toFixed(2) || 'N/A'})`);
          });
          console.log('');
        }
      } catch (error) {
        // Skip if empty or error
      }
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await closeWeaviateClient();
  }
}

main();
