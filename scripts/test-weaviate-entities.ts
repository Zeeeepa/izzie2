/**
 * Test Weaviate Entity Storage
 *
 * Tests saving, searching, and retrieving entities from Weaviate.
 *
 * Usage:
 *   npx tsx scripts/test-weaviate-entities.ts
 */

import { config } from 'dotenv';
import {
  saveEntities,
  searchEntities,
  getEntitiesBySource,
  deleteEntitiesBySource,
  getEntityStats,
  closeWeaviateClient,
} from '../src/lib/weaviate';
import type { Entity } from '../src/lib/extraction/types';

// Load environment variables
config({ path: '.env.local' });

const TEST_USER_ID = 'test-user-123';
const TEST_SOURCE_ID = 'test-email-456';

async function main() {
  console.log('🧪 Testing Weaviate entity storage...\n');

  try {
    // Sample entities
    const testEntities: Entity[] = [
      {
        type: 'person',
        value: 'John Doe',
        normalized: 'john_doe',
        confidence: 0.95,
        source: 'body',
        context: 'Meeting with John Doe on Friday',
      },
      {
        type: 'company',
        value: 'Acme Corp',
        normalized: 'acme_corp',
        confidence: 0.92,
        source: 'subject',
        context: 'Re: Acme Corp proposal',
      },
      {
        type: 'project',
        value: 'Project Alpha',
        normalized: 'project_alpha',
        confidence: 0.88,
        source: 'body',
        context: 'Discussed Project Alpha timeline',
      },
      {
        type: 'action_item',
        value: 'Send proposal to client',
        normalized: 'send_proposal_to_client',
        confidence: 0.91,
        source: 'body',
        assignee: 'john_doe',
        deadline: '2026-01-25',
        priority: 'high',
        context: 'Action: Send proposal to client by Friday',
      },
      {
        type: 'location',
        value: 'New York Office',
        normalized: 'new_york_office',
        confidence: 0.87,
        source: 'body',
        context: 'Meeting at New York Office',
      },
    ];

    // Test 1: Save entities
    console.log('1️⃣ Saving entities...');
    await saveEntities(testEntities, TEST_USER_ID, TEST_SOURCE_ID);
    console.log('✅ Entities saved\n');

    // Test 2: Get entities by source
    console.log('2️⃣ Retrieving entities by source...');
    const retrieved = await getEntitiesBySource(TEST_SOURCE_ID, TEST_USER_ID);
    console.log(`✅ Retrieved ${retrieved.length} entities:`);
    retrieved.forEach((entity) => {
      console.log(`   - ${entity.type}: ${entity.value} (confidence: ${entity.confidence})`);
    });
    console.log();

    // Test 3: Search entities
    console.log('3️⃣ Searching for "John Doe"...');
    const searchResults = await searchEntities('John Doe', TEST_USER_ID, { limit: 5 });
    console.log(`✅ Found ${searchResults.length} matching entities:`);
    searchResults.forEach((entity) => {
      console.log(`   - ${entity.type}: ${entity.value}`);
    });
    console.log();

    // Test 4: Get entity stats
    console.log('4️⃣ Getting entity statistics...');
    const stats = await getEntityStats(TEST_USER_ID);
    console.log('✅ Entity counts by type:');
    Object.entries(stats).forEach(([type, count]) => {
      if (count > 0) {
        console.log(`   - ${type}: ${count}`);
      }
    });
    console.log();

    // Test 5: Delete entities
    console.log('5️⃣ Cleaning up test entities...');
    const deleted = await deleteEntitiesBySource(TEST_SOURCE_ID, TEST_USER_ID);
    console.log(`✅ Deleted ${deleted} entities\n`);

    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await closeWeaviateClient();
  }
}

main();
