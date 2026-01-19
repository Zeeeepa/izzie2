/**
 * Test Memory Search - Simple Version
 *
 * Debug why "Prefers to be called Masa" memory isn't retrieved
 */

import 'dotenv/config';
import { searchMemories, getRecentMemories } from '../src/lib/memory/retrieval.ts';

const MEMORY_ID = '2d1ccdd7-f70f-4974-b730-7df1679c44c4';
const USER_ID = 'google-oauth2|111548693083126671619';

async function testMemorySearch() {
  console.log('\n=== Memory Search Debug ===\n');
  console.log('Environment check:');
  console.log('WEAVIATE_URL:', process.env.WEAVIATE_URL ? '✓ Set' : '✗ Missing');
  console.log('WEAVIATE_API_KEY:', process.env.WEAVIATE_API_KEY ? '✓ Set' : '✗ Missing');
  console.log('');

  try {
    // Test 1: Search with "hello" (what user sends)
    console.log('Test 1: Search with "hello"');
    const helloResults = await searchMemories({
      query: 'hello',
      userId: USER_ID,
      limit: 20,
      minStrength: 0.3,
    });
    console.log(`Found ${helloResults.length} memories`);
    helloResults.forEach((m) => {
      console.log(`  - ${m.content} (strength: ${m.strength.toFixed(2)})`);
    });

    // Test 2: Search with "masa"
    console.log('\nTest 2: Search with "masa"');
    const masaResults = await searchMemories({
      query: 'masa',
      userId: USER_ID,
      limit: 20,
      minStrength: 0.3,
    });
    console.log(`Found ${masaResults.length} memories`);
    masaResults.forEach((m) => {
      console.log(`  - ${m.content} (strength: ${m.strength.toFixed(2)})`);
    });

    // Test 3: Get ALL memories
    console.log('\nTest 3: Get ALL memories for user');
    const allMemories = await getRecentMemories(USER_ID, {
      limit: 50,
      minStrength: 0.0,
    });
    console.log(`Found ${allMemories.length} total memories`);
    allMemories.forEach((m) => {
      console.log(`  - ${m.content} (category: ${m.category}, strength: ${m.strength.toFixed(2)})`);
    });

    // Test 4: Check specific memory
    console.log(`\nTest 4: Check for target memory ${MEMORY_ID}`);
    const targetMemory = allMemories.find((m) => m.id === MEMORY_ID);
    if (targetMemory) {
      console.log('✅ Found target memory:');
      console.log(`   Content: ${targetMemory.content}`);
      console.log(`   Category: ${targetMemory.category}`);
      console.log(`   Strength: ${targetMemory.strength}`);
      console.log(`   Importance: ${targetMemory.importance}`);
    } else {
      console.log('❌ Target memory NOT FOUND');
    }

    console.log('\n=== Root Cause ===');
    console.log('BM25 keyword search requires text overlap.');
    console.log('"hello" has no words in common with "Prefers to be called Masa"');
    console.log('\n=== Solution Needed ===');
    console.log('1. Add semantic/vector search for memories');
    console.log('2. OR: Always include high-importance preferences');
    console.log('3. OR: Use hybrid search (BM25 + vector)');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testMemorySearch();
