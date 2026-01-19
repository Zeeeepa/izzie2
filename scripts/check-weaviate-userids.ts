/**
 * Check what userIds are actually stored in Weaviate entities
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local explicitly for Weaviate credentials
config({ path: resolve(process.cwd(), '.env.local') });

import { getWeaviateClient } from '../src/lib/weaviate/client';
import { COLLECTIONS } from '../src/lib/weaviate/schema';

async function checkWeaviateUserIds() {
  try {
    console.log('Connecting to Weaviate...');
    const client = await getWeaviateClient();

    console.log('\n=== Checking userIds in Weaviate Collections ===\n');

    // Collections to check
    const collectionsToCheck = ['Person', 'Company', 'ActionItem'];

    for (const collectionName of collectionsToCheck) {
      console.log(`\n--- ${collectionName} Collection ---`);

      try {
        const collection = client.collections.get(collectionName);

        // Fetch a sample of entities
        const result = await collection.query.fetchObjects({
          limit: 10,
          returnProperties: ['value', 'userId', 'sourceId', 'extractedAt'],
        });

        console.log(`Total objects fetched: ${result.objects.length}`);

        if (result.objects.length === 0) {
          console.log('No entities found in this collection');
          continue;
        }

        // Group by userId
        const userIdMap = new Map<string, number>();
        const sampleEntities: any[] = [];

        result.objects.forEach((obj: any) => {
          const userId = obj.properties.userId || 'null/undefined';
          userIdMap.set(userId, (userIdMap.get(userId) || 0) + 1);

          // Keep first 3 entities as examples
          if (sampleEntities.length < 3) {
            sampleEntities.push({
              value: obj.properties.value,
              userId: obj.properties.userId,
              sourceId: obj.properties.sourceId,
              extractedAt: obj.properties.extractedAt,
            });
          }
        });

        console.log('\nUserIds found in sample:');
        userIdMap.forEach((count, userId) => {
          console.log(`  ${userId}: ${count} entities`);
        });

        console.log('\nSample entities:');
        sampleEntities.forEach((entity, idx) => {
          console.log(`  ${idx + 1}. "${entity.value}"`);
          console.log(`     userId: ${entity.userId || 'NOT SET'}`);
          console.log(`     sourceId: ${entity.sourceId || 'NOT SET'}`);
          console.log(`     extractedAt: ${entity.extractedAt || 'NOT SET'}`);
        });

        // Get total count for this collection
        const stats = await collection.aggregate.overAll();
        console.log(`\nTotal entities in ${collectionName}: ${stats.totalCount}`);
      } catch (error) {
        console.error(`Error querying ${collectionName}:`, error);
      }
    }

    // Summary
    console.log('\n=== Summary ===');
    console.log('Expected userId from database: tlHWmrogZXPR91lqdGO1fXM02j92rVDF');
    console.log('\nIf the userIds above are different or null/undefined, we need to:');
    console.log('1. Update existing entities with correct userId, OR');
    console.log('2. Remove userId filtering if this is a single-user app');
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

checkWeaviateUserIds().catch(console.error);
