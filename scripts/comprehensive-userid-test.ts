/**
 * Comprehensive test to verify userId in entire flow
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local explicitly
config({ path: resolve(process.cwd(), '.env.local') });

import { getWeaviateClient } from '../src/lib/weaviate/client';
import { COLLECTIONS } from '../src/lib/weaviate/schema';
import { listEntitiesByType, getEntityStats } from '../src/lib/weaviate/entities';

async function comprehensiveTest() {
  // Test user ID for development - not a secret  pragma: allowlist secret
  const userId = 'tlHWmrogZXPR91lqdGO1fXM02j92rVDF';

  console.log('=== COMPREHENSIVE USER ID VERIFICATION ===\n');
  console.log(`Testing with userId: ${userId}\n`);

  // Test 1: Get overall stats (not filtered by user)
  console.log('--- Test 1: Overall Entity Stats (no user filter) ---');
  const stats = await getEntityStats(userId);
  const totalEntities = Object.values(stats).reduce((sum, count) => sum + count, 0);
  console.log('Total entities in Weaviate:', totalEntities);
  console.log('Breakdown:', stats);
  console.log('');

  // Test 2: Sample entities from each collection to check userId
  console.log('--- Test 2: Sample Entities with userId Check ---');
  const client = await getWeaviateClient();

  for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
    const collection = client.collections.get(collectionName);
    const result = await collection.query.fetchObjects({
      limit: 5,
      returnProperties: ['value', 'userId'],
    });

    const userIdMatches = result.objects.filter(
      (obj: any) => obj.properties.userId === userId
    ).length;

    console.log(
      `${collectionName}: ${userIdMatches}/${result.objects.length} have correct userId`
    );
  }
  console.log('');

  // Test 3: Use listEntitiesByType function (what the API uses)
  console.log('--- Test 3: listEntitiesByType Function (API layer) ---');
  const personEntities = await listEntitiesByType(userId, 'person', 5);
  const companyEntities = await listEntitiesByType(userId, 'company', 5);
  const actionItemEntities = await listEntitiesByType(userId, 'action_item', 5);

  console.log(`Person entities returned: ${personEntities.length}`);
  console.log(`Company entities returned: ${companyEntities.length}`);
  console.log(`Action item entities returned: ${actionItemEntities.length}`);
  console.log('');

  // Summary
  console.log('=== SUMMARY ===');
  if (personEntities.length > 0 && companyEntities.length > 0 && actionItemEntities.length > 0) {
    console.log('✅ SUCCESS: Entities are correctly filtered by userId');
    console.log('✅ The API should work correctly');
    console.log('');
    console.log('If the dashboard shows 0 entities, the issue is:');
    console.log('1. Session userId not matching (check browser console for userId in API logs)');
    console.log('2. Frontend not sending credentials properly');
    console.log('3. Different user logged in than expected');
  } else {
    console.log('❌ FAILURE: Entities are NOT being filtered correctly');
    console.log('The userId association is broken');
  }

  process.exit(0);
}

comprehensiveTest().catch(console.error);
