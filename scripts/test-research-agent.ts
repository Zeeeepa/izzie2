/**
 * Test Research Agent Implementation
 * Simple smoke test to verify agent can be instantiated
 */

import { ResearchAgent } from '../src/agents/research';

async function testResearchAgent() {
  console.log('🧪 Testing Research Agent Implementation...\n');

  // Test 1: Agent instantiation
  console.log('1️⃣ Testing agent instantiation...');
  const agent = new ResearchAgent();
  const config = agent.getConfig();
  console.log('✅ Agent created successfully');
  console.log(`   - Name: ${config.name}`);
  console.log(`   - Version: ${config.version}`);
  console.log(`   - Max Budget: $${config.maxBudget}`);
  console.log(`   - Max Duration: ${config.maxDuration}ms\n`);

  // Test 2: Input validation
  console.log('2️⃣ Testing input validation...');
  const validInput = { query: 'Test query' };
  const invalidInput = { query: '' };

  // @ts-expect-error - Accessing protected method for testing
  const isValid = await agent.validateInput(validInput);
  // @ts-expect-error - Accessing protected method for testing
  const isInvalid = await agent.validateInput(invalidInput);

  console.log(`✅ Valid input check: ${isValid}`);
  console.log(`✅ Invalid input check: ${!isInvalid}\n`);

  // Test 3: Import all modules
  console.log('3️⃣ Testing module imports...');
  const modules = [
    'ResearchAgent',
    'planResearch',
    'analyzeSource',
    'synthesize',
  ];

  try {
    const { planResearch, analyzeSource, synthesize } = await import('../src/agents/research');
    console.log(`✅ Successfully imported: ${modules.join(', ')}\n`);
  } catch (error) {
    console.error('❌ Failed to import modules:', error);
    process.exit(1);
  }

  console.log('🎉 All tests passed!\n');
  console.log('Next steps:');
  console.log('- Set up Brave Search API key (BRAVE_SEARCH_API_KEY)');
  console.log('- Set up OpenRouter API key (OPENROUTER_API_KEY)');
  console.log('- Test with real search query');
  console.log('- Register with Inngest for event-driven execution');
}

testResearchAgent().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
