/**
 * Test memory save to Weaviate
 */

import { saveMemory } from '../src/lib/memory/storage';

async function testMemorySave() {
  console.log('Testing memory save...\n');

  try {
    const memory = await saveMemory({
      userId: 'test-user',
      content: 'Test memory content',
      category: 'preference',
      sourceType: 'chat',
      sourceId: 'test-123',
      importance: 0.9,
    });

    console.log('Memory saved successfully:');
    console.log(JSON.stringify(memory, null, 2));

    // Try to fetch it back
    const { getMemoryById } = await import('../src/lib/memory/storage');
    const fetched = await getMemoryById(memory.id);

    console.log('\nFetched memory:');
    console.log(JSON.stringify(fetched, null, 2));
  } catch (error) {
    console.error('Error saving memory:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
  }
}

testMemorySave()
  .then(() => {
    console.log('\n✓ Test complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
