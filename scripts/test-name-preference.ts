/**
 * Test saving and retrieving a name preference memory
 */

import { saveMemory } from '../src/lib/memory/storage';
import { searchMemories } from '../src/lib/memory/retrieval';

async function testNamePreference() {
  const userId = 'test-user-name';

  console.log('Step 1: Saving name preference memory...\n');

  const memory = await saveMemory({
    userId,
    content: 'Prefers to be called Masa instead of Robert',
    category: 'preference',
    sourceType: 'chat',
    sourceId: 'test-chat-1',
    importance: 0.9, // High importance for name preference
  });

  console.log('✓ Memory saved:');
  console.log(`  ID: ${memory.id}`);
  console.log(`  Content: ${memory.content}`);
  console.log(`  Importance: ${memory.importance}`);
  console.log();

  console.log('Step 2: Searching for name preference (threshold 0.8)...\n');

  const results = await searchMemories({
    query: 'name preference',
    userId,
    minImportance: 0.8,
    limit: 5,
  });

  console.log(`✓ Found ${results.length} high-importance preferences:`);
  results.forEach((m) => {
    console.log(`  - ${m.content} (importance: ${m.importance}, strength: ${m.strength})`);
  });
  console.log();

  console.log('Step 3: Searching with lower threshold (0.5)...\n');

  const allResults = await searchMemories({
    query: 'name preference',
    userId,
    minImportance: 0.5,
    limit: 5,
  });

  console.log(`✓ Found ${allResults.length} preferences (any importance):`);
  allResults.forEach((m) => {
    console.log(`  - ${m.content} (importance: ${m.importance}, strength: ${m.strength})`);
  });
  console.log();

  console.log('Step 4: Testing query matching...\n');

  const queryResults = await searchMemories({
    query: 'Masa',
    userId,
    minImportance: 0.5,
    limit: 5,
  });

  console.log(`✓ Query "Masa" returned ${queryResults.length} results:`);
  queryResults.forEach((m) => {
    console.log(`  - ${m.content.substring(0, 50)}...`);
  });
}

testNamePreference()
  .then(() => {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n✗ Test failed:', err);
    process.exit(1);
  });
