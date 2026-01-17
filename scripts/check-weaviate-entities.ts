#!/usr/bin/env ts-node
/**
 * Check Weaviate Entity Storage
 *
 * Queries Weaviate to show entity counts and recent entities.
 * Useful for verifying the integration is working.
 */

import { getWeaviateClient, isWeaviateReady } from '@/lib/weaviate/client';
import { COLLECTIONS } from '@/lib/weaviate/schema';

async function main() {
  console.log('\n========================================');
  console.log('Weaviate Entity Storage Check');
  console.log('========================================\n');

  // Check if Weaviate is ready
  const isReady = await isWeaviateReady();
  if (!isReady) {
    console.error('❌ Weaviate is not ready. Make sure it\'s running:');
    console.error('   docker-compose up -d weaviate\n');
    process.exit(1);
  }

  console.log('✅ Weaviate is ready\n');

  const client = await getWeaviateClient();

  // Check each collection
  console.log('Entity Counts by Type:');
  console.log('─'.repeat(40));

  let totalEntities = 0;

  for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
    try {
      const collection = client.collections.get(collectionName);
      const result = await collection.aggregate.overAll();
      const count = result.totalCount || 0;

      totalEntities += count;

      const icon = count > 0 ? '📊' : '⚪';
      console.log(`${icon} ${entityType.padEnd(15)} ${count.toString().padStart(5)} entities`);
    } catch (error) {
      console.log(`❌ ${entityType.padEnd(15)} Error: ${error}`);
    }
  }

  console.log('─'.repeat(40));
  console.log(`   Total:          ${totalEntities.toString().padStart(5)} entities\n`);

  // Show recent entities (up to 5)
  if (totalEntities > 0) {
    console.log('Recent Entities:');
    console.log('─'.repeat(80));

    for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
      try {
        const collection = client.collections.get(collectionName);
        const result = await collection.query.fetchObjects({
          limit: 3,
          returnProperties: ['value', 'normalized', 'confidence', 'userId', 'sourceId', 'extractedAt'],
        });

        if (result.objects.length > 0) {
          console.log(`\n${entityType.toUpperCase()}:`);
          for (const obj of result.objects) {
            const props = obj.properties as any;
            console.log(`  • "${props.value}" (confidence: ${props.confidence.toFixed(2)})`);
            console.log(`    User: ${props.userId.substring(0, 8)}... | Source: ${props.sourceId.substring(0, 12)}...`);
          }
        }
      } catch (error) {
        // Skip if no entities
      }
    }
    console.log('\n' + '─'.repeat(80));
  }

  console.log('\n✅ Check complete\n');
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
