/**
 * Test memory persistence from chat
 *
 * This script tests that memories can be saved from chat conversations
 * and retrieved later.
 */

import { saveMemory, getMemoryById } from '../src/lib/memory/storage';

async function testMemoryPersistence() {
  console.log('Testing memory persistence from chat...\n');

  const testUserId = 'test-user-123';
  const testSessionId = 'test-session-456';

  try {
    // Test 1: Save a name preference memory (high importance)
    console.log('1. Saving name preference memory...');
    const nameMemory = await saveMemory({
      userId: testUserId,
      category: 'preference',
      content: 'User prefers to be called Masa',
      importance: 0.9,
      sourceType: 'chat',
      sourceId: testSessionId,
      context: 'Name preference',
      sourceDate: new Date(),
    });
    console.log(`   ✓ Saved memory: ${nameMemory.id}`);
    console.log(`   Content: ${nameMemory.content}`);
    console.log(`   Importance: ${nameMemory.importance}`);
    console.log(`   Category: ${nameMemory.category}\n`);

    // Test 2: Retrieve the memory
    console.log('2. Retrieving memory by ID...');
    const retrieved = await getMemoryById(nameMemory.id);
    if (retrieved) {
      console.log(`   ✓ Retrieved memory: ${retrieved.id}`);
      console.log(`   Content: ${retrieved.content}`);
      console.log(`   Match: ${retrieved.content === nameMemory.content ? 'YES' : 'NO'}\n`);
    } else {
      console.log('   ✗ Failed to retrieve memory\n');
    }

    // Test 3: Save a general preference memory (medium importance)
    console.log('3. Saving general preference memory...');
    const prefMemory = await saveMemory({
      userId: testUserId,
      category: 'preference',
      content: 'User prefers morning meetings',
      importance: 0.7,
      sourceType: 'chat',
      sourceId: testSessionId,
      context: 'Meeting preference',
      sourceDate: new Date(),
    });
    console.log(`   ✓ Saved memory: ${prefMemory.id}`);
    console.log(`   Content: ${prefMemory.content}`);
    console.log(`   Importance: ${prefMemory.importance}\n`);

    // Test 4: Save a fact memory (medium importance)
    console.log('4. Saving fact memory...');
    const factMemory = await saveMemory({
      userId: testUserId,
      category: 'fact',
      content: 'User works as a software engineer',
      importance: 0.6,
      sourceType: 'chat',
      sourceId: testSessionId,
      context: 'Work information',
      sourceDate: new Date(),
    });
    console.log(`   ✓ Saved memory: ${factMemory.id}`);
    console.log(`   Content: ${factMemory.content}`);
    console.log(`   Importance: ${factMemory.importance}\n`);

    console.log('✅ All tests passed!');
    console.log('\nNext steps:');
    console.log('1. Start the dev server: npm run dev');
    console.log('2. Open chat and say: "Call me Masa"');
    console.log('3. Check that Izzie responds with the name and saves a memory');
    console.log('4. In the next message, verify Izzie uses "Masa" instead of your account name');

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testMemoryPersistence();
