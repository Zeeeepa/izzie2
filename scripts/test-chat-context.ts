/**
 * Test Chat Context Integration
 *
 * Verifies that chat API retrieves entities and memories correctly.
 */

import { retrieveContext } from '../src/lib/chat/context-retrieval';
import { buildSystemPrompt, formatContextSummary } from '../src/lib/chat/context-formatter';

async function testChatContext() {
  console.log('=== Testing Chat Context Integration ===\n');

  // Test user ID (replace with actual user ID from your database)
  const userId = 'test-user-id';

  // Test queries
  const queries = [
    'What is happening with the database migration?',
    'When should I schedule the meeting with John?',
    'Tell me about Project Alpha',
    'What are my upcoming deadlines?',
  ];

  for (const query of queries) {
    console.log(`\n--- Query: "${query}" ---\n`);

    try {
      // Retrieve context
      const context = await retrieveContext(userId, query, undefined, {
        maxEntities: 10,
        maxMemories: 10,
        minMemoryStrength: 0.3,
      });

      // Log summary
      const summary = formatContextSummary(context);
      console.log('Context Summary:', summary);

      // Log detailed context
      console.log('\nEntities Found:', context.entities.length);
      if (context.entities.length > 0) {
        console.log('Sample Entities:');
        context.entities.slice(0, 3).forEach((entity) => {
          console.log(
            `  - ${entity.type}: ${entity.value} (confidence: ${entity.confidence.toFixed(2)})`
          );
          if (entity.context) {
            console.log(`    Context: ${entity.context}`);
          }
        });
      }

      console.log('\nMemories Found:', context.memories.length);
      if (context.memories.length > 0) {
        console.log('Sample Memories:');
        context.memories.slice(0, 3).forEach((memory) => {
          console.log(
            `  - ${memory.category}: ${memory.content.substring(0, 100)} (strength: ${memory.strength.toFixed(2)})`
          );
        });
      }

      // Generate system prompt
      const systemPrompt = buildSystemPrompt(context, query);
      console.log('\nSystem Prompt Length:', systemPrompt.length, 'characters');

      // Show a snippet of the prompt
      console.log('\nPrompt Preview:');
      console.log(systemPrompt.substring(0, 300) + '...\n');
    } catch (error) {
      console.error('Error testing query:', error);
    }
  }

  console.log('\n=== Test Complete ===');
}

// Run test
testChatContext()
  .then(() => {
    console.log('\nTest completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
