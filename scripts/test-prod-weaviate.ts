/**
 * Test Weaviate connection with production env vars
 */
import weaviate from 'weaviate-client';

async function main() {
  const url = process.env.WEAVIATE_URL;
  const apiKey = process.env.WEAVIATE_API_KEY;

  console.log('Testing Weaviate connection...');
  console.log('URL:', url?.substring(0, 50) + '...');
  console.log('API Key length:', apiKey?.length);

  if (!url || !apiKey) {
    console.error('Missing WEAVIATE_URL or WEAVIATE_API_KEY');
    process.exit(1);
  }

  try {
    const client = await weaviate.connectToWeaviateCloud(url, {
      authCredentials: new weaviate.ApiKey(apiKey),
    });
    console.log('Connected to Weaviate!');

    // Check collections
    const collections = ['Person', 'Company', 'Project', 'Date', 'Topic', 'Location', 'ActionItem'];

    for (const name of collections) {
      try {
        const collection = client.collections.get(name);
        const result = await collection.aggregate.overAll();
        console.log(`  ${name}: ${result.totalCount} entities`);
      } catch (e) {
        console.log(`  ${name}: Error - ${e}`);
      }
    }

    await client.close();
    console.log('\nConnection test passed!');
  } catch (error) {
    console.error('Connection failed:', error);
    process.exit(1);
  }
}

main();
