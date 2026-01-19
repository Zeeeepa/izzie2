/**
 * Check importance values of memories in Weaviate
 */

import { getWeaviateClient } from '../src/lib/weaviate/client';

const MEMORY_COLLECTION = 'Memory';

async function checkMemoryImportance() {
  const client = await getWeaviateClient();
  const collection = client.collections.get(MEMORY_COLLECTION);

  console.log('Fetching recent memories...\n');

  const result = await collection.query.fetchObjects({
    limit: 10,
  });

  console.log(`Found ${result.objects.length} memories:\n`);

  result.objects.forEach((obj, idx) => {
    const props = obj.properties as any;
    console.log(`Memory ${idx + 1}:`);
    console.log(`  Content: ${props.content}`);
    console.log(`  Category: ${props.category}`);
    console.log(`  Importance: ${props.importance}`);
    console.log(`  Created: ${props.createdAt}`);
    console.log('---');
  });
}

checkMemoryImportance()
  .then(() => {
    console.log('\n✓ Check complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
