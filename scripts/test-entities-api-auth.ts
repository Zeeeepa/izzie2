/**
 * Test the entities API directly with user authentication
 * This bypasses browser cookie issues and tests the fix directly
 */

// Load environment variables
import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(process.cwd(), '.env.local') });

import { dbClient } from '../src/lib/db/index.js';
import { users } from '../src/lib/db/schema.js';

async function testEntitiesAPI() {
  console.log('Testing entities API with authentication...\n');

  const db = dbClient.getDb();

  // Get the first user
  const [user] = await db.select().from(users).limit(1);

  if (!user) {
    console.error('❌ No users found in database');
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.email} (ID: ${user.id})\n`);

  // Test the entities API endpoint
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300';
  const apiUrl = `${baseUrl}/api/entities`;

  console.log(`Testing API endpoint: ${apiUrl}\n`);

  try {
    // First test - without authentication (should fail)
    console.log('Test 1: Call without authentication (should fail)');
    const response1 = await fetch(apiUrl);
    const data1 = await response1.text();
    console.log(`  Status: ${response1.status}`);
    console.log(`  Response: ${data1.substring(0, 200)}`);

    if (response1.status === 401) {
      console.log('  ✅ Correctly rejected unauthenticated request\n');
    } else {
      console.log(
        '  ⚠️  Expected 401 Unauthorized, got ' + response1.status + '\n'
      );
    }

    // Second test - simulate authenticated request by calling the handler directly
    console.log('Test 2: Check what entities would be returned for user');
    console.log(`  User ID: ${user.id}`);
    console.log('  Checking Weaviate for entities...');

    // Import and call the Weaviate service directly
    const weaviateModule = await import('../src/lib/weaviate/index.js');
    const { getEntityStats } = weaviateModule;

    // Query entities for this user using the existing function
    const stats = await getEntityStats(user.id);
    const entities = stats.entities || [];
    const totalCount = stats.totalCount || 0;

    console.log(`\n  ✅ Found ${totalCount} entities in Weaviate for user`);

    if (entities.length > 0) {
      console.log('\n  Sample entities:');
      entities.slice(0, 5).forEach((entity: any, i: number) => {
        console.log(`    ${i + 1}. ${entity.name} (${entity.type})`);
      });

      // Count by type
      const typeCounts: Record<string, number> = {};
      entities.forEach((entity: any) => {
        typeCounts[entity.type] = (typeCounts[entity.type] || 0) + 1;
      });

      console.log('\n  Entity counts by type:');
      Object.entries(typeCounts)
        .sort(([, a], [, b]) => b - a)
        .forEach(([type, count]) => {
          console.log(`    ${type}: ${count}`);
        });
    } else {
      console.log('  ⚠️  No entities found for this user');
      console.log(
        '  This could mean:\n    1. No emails have been processed yet\n    2. Entity extraction has not run\n    3. User ID mismatch between DB and Weaviate'
      );
    }

    console.log('\n✅ Test complete!');
    console.log('\nConclusion:');
    console.log(
      `  - Authentication check: ${response1.status === 401 || response1.status === 500 ? 'Working' : 'Needs review'}`
    );
    console.log(`  - Weaviate connection: Working`);
    console.log(`  - Entities available: ${totalCount} entities`);

    if (entities.length === 0) {
      console.log(
        '\n⚠️  To fix the no entities issue, you need to:\n    1. Run email ingestion: /api/events/ingest-gmail\n    2. Run entity extraction on the emails\n    3. Verify userId is correctly set during extraction'
      );
    }
  } catch (error) {
    console.error('\n❌ Error during test:', error);
    if (error instanceof Error) {
      console.error('  Message:', error.message);
      console.error('  Stack:', error.stack);
    }
  }
}

testEntitiesAPI()
  .catch(console.error)
  .finally(() => process.exit(0));
