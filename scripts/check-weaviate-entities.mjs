import weaviate from 'weaviate-client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const client = await weaviate.connectToWeaviateCloud(
  process.env.WEAVIATE_URL,
  {
    authCredentials: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY),
  }
);

console.log('\n=== Checking Weaviate Entities ===\n');

// Test user ID for development - not a secret  pragma: allowlist secret
const userId = 'tlHWmrogZXPR91lqdGO1fXM02j92rVDF';
const collections = ['Person', 'Company', 'Project', 'Topic', 'ActionItem', 'Date', 'Location'];

for (const collectionName of collections) {
  console.log(`\n📊 ${collectionName} Entities:`);
  console.log('─'.repeat(60));

  try {
    const collection = client.collections.get(collectionName);
    const result = await collection.query.fetchObjects({
      filters: collection.filter.byProperty('userId').equal(userId),
      limit: 20,
    });

    if (!result.objects || result.objects.length === 0) {
      console.log('  (No entities found)');
    } else {
      let i = 1;
      for (const obj of result.objects) {
        console.log(`  ${i}. ${obj.properties.name}`);
        if (obj.properties.description) {
          const desc = obj.properties.description.substring(0, 80);
          console.log(`     ${desc}...`);
        }
        i++;
      }
      console.log(`\n  Total: ${result.objects.length} entities`);
    }
  } catch (error) {
    console.error(`  Error querying ${collectionName}:`, error.message);
  }
}

console.log('\n=== Done ===\n');
process.exit(0);
