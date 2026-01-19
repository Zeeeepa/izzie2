import * as dotenv from 'dotenv';
import * as path from 'path';
import { getWeaviateClient } from '../src/lib/weaviate/client';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const client = await getWeaviateClient();

  try {
    // Get all collections
    const collections = await client.collections.listAll();
    console.log('\nAll collections:');
    for (const collection of collections) {
      console.log(`  - ${collection.name}`);
    }

    // Check if Memory collection exists
    const memoryExists = collections.some(c => c.name === 'Memory');
    console.log(`\nMemory collection exists: ${memoryExists}`);

    if (memoryExists) {
      // Get Memory collection data
      const memoryCollection = client.collections.get('Memory');
      const result = await memoryCollection.query.fetchObjects({
        limit: 10,
      });

      console.log(`\nMemory collection has ${result.objects.length} memories stored`);

      for (const obj of result.objects) {
        const props = obj.properties as any;
        const contentPreview = props.content?.substring(0, 60) || 'N/A';
        console.log(`\n  Memory: ${contentPreview}...`);
        console.log(`    Category: ${props.category}`);
        console.log(`    Importance: ${props.importance}`);
        console.log(`    Confidence: ${props.confidence}`);
        console.log(`    Source: ${props.sourceType}`);
        console.log(`    Tags: ${Array.isArray(props.tags) ? props.tags.join(', ') : JSON.stringify(props.tags) || 'none'}`);
      }
    }
  } finally {
    await client.close();
  }
}

main().catch(console.error);
