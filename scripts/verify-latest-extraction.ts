/**
 * Verify Latest Entity Extraction
 * Query Weaviate to verify recently extracted entities
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import weaviate, { WeaviateClient } from 'weaviate-client';

async function main() {
  console.log('Connecting to Weaviate...');
  const client: WeaviateClient = await weaviate.connectToWeaviateCloud(
    process.env.WEAVIATE_URL!,
    {
      authCredentials: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY!),
    }
  );

  console.log('\nQuerying recent entities...\n');

  // Query all collections
  const collections = ['Person', 'Company', 'Project', 'Date', 'Topic', 'Location', 'ActionItem'];

  for (const collectionName of collections) {
    try {
      const collection = client.collections.get(collectionName);
      const result = await collection.query.fetchObjects({
        limit: 20,
        returnProperties: ['value', 'normalized', 'confidence', 'source', 'context'],
      });

      if (result.objects.length > 0) {
        console.log(`\n=== ${collectionName} (${result.objects.length}) ===`);
        result.objects.forEach((obj: any) => {
          const props = obj.properties;
          const contextPreview = props.context
            ? props.context.substring(0, 80) + (props.context.length > 80 ? '...' : '')
            : '';
          console.log(`  • ${props.value}`);
          console.log(`    Normalized: ${props.normalized}`);
          console.log(`    Confidence: ${props.confidence}, Source: ${props.source}`);
          if (contextPreview) {
            console.log(`    Context: ${contextPreview}`);
          }
        });
      }
    } catch (error) {
      console.log(`  ${collectionName}: No data or error`);
    }
  }

  client.close();
  console.log('\nDone!');
}

main().catch(console.error);
