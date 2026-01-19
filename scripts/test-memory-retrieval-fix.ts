/**
 * Test script to verify high-importance preference memories are always retrieved
 */

import { retrieveContext } from '../src/lib/chat/context-retrieval';
import { searchMemories } from '../src/lib/memory/retrieval';

const TEST_USER_ID = 'test-user-123';

async function testPreferenceRetrieval() {
  console.log('🧪 Testing Memory Retrieval Fix\n');

  try {
    // Test 1: Direct preference search with minImportance
    console.log('Test 1: Direct preference search with minImportance >= 0.8');
    const preferences = await searchMemories({
      query: 'user preferences name',
      userId: TEST_USER_ID,
      categories: ['preference'],
      minImportance: 0.8,
      limit: 5,
    });
    console.log(`✅ Found ${preferences.length} high-importance preferences`);
    preferences.forEach((mem) => {
      console.log(`   - ${mem.content} (importance: ${mem.importance})`);
    });
    console.log();

    // Test 2: Context retrieval with generic query (e.g., "Hello")
    console.log('Test 2: Context retrieval with generic query "Hello"');
    const context = await retrieveContext(TEST_USER_ID, 'Hello', undefined, {
      maxMemories: 10,
    });
    console.log(`✅ Retrieved ${context.memories.length} total memories`);
    const prefMemories = context.memories.filter((m) => m.category === 'preference');
    console.log(`   - ${prefMemories.length} preference memories`);
    prefMemories.forEach((mem) => {
      console.log(`     * ${mem.content} (importance: ${mem.importance})`);
    });
    console.log();

    // Test 3: Context retrieval with specific query
    console.log('Test 3: Context retrieval with specific query "What projects am I working on?"');
    const context2 = await retrieveContext(
      TEST_USER_ID,
      'What projects am I working on?',
      undefined,
      {
        maxMemories: 10,
      }
    );
    console.log(`✅ Retrieved ${context2.memories.length} total memories`);
    const prefMemories2 = context2.memories.filter((m) => m.category === 'preference');
    console.log(`   - ${prefMemories2.length} preference memories (should include name preference)`);
    prefMemories2.forEach((mem) => {
      console.log(`     * ${mem.content} (importance: ${mem.importance})`);
    });

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testPreferenceRetrieval().catch(console.error);
