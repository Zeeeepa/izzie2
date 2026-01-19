/**
 * Check Entity UserIds
 *
 * Sample entities from each collection to see what userIds are stored
 */

import { config } from 'dotenv';
import { getWeaviateClient, closeWeaviateClient } from '../src/lib/weaviate/client';
import { COLLECTIONS } from '../src/lib/weaviate/schema';

// Load environment variables
config({ path: '.env.local' });

async function main() {
  console.log('=== Checking Entity UserIds ===\n');

  try {
    const client = await getWeaviateClient();

    // Track all unique userIds found
    const allUserIds = new Set<string>();

    for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
      try {
        const collection = client.collections.get(collectionName);

        // Fetch sample entities
        const result = await collection.query.fetchObjects({
          limit: 10,
          returnProperties: ['value', 'userId', 'sourceId'],
        });

        if (result.objects.length > 0) {
          console.log(`\n${collectionName}:`);
          console.log('='.repeat(50));

          result.objects.forEach((obj, idx) => {
            const props = obj.properties as any;
            const userId = props.userId || 'NO_USER_ID';
            allUserIds.add(userId);

            console.log(`  ${idx + 1}. userId: "${userId}"`);
            console.log(`     value: "${props.value}"`);
            console.log(`     sourceId: "${props.sourceId}"`);
          });
        }
      } catch (error) {
        console.error(`Error checking ${collectionName}:`, error instanceof Error ? error.message : String(error));
      }
    }

    console.log('\n\n=== Summary ===');
    console.log(`Total unique userIds found: ${allUserIds.size}`);
    console.log('\nUnique userIds:');
    Array.from(allUserIds).forEach((userId, idx) => {
      console.log(`  ${idx + 1}. "${userId}"`);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await closeWeaviateClient();
  }
}

main();
