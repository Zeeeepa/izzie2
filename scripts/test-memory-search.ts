/**
 * Test Memory Search
 *
 * Debug why "Prefers to be called Masa" memory isn't retrieved when user says "Hello"
 */

import { searchMemories } from '../src/lib/memory/retrieval';

const MEMORY_ID = '2d1ccdd7-f70f-4974-b730-7df1679c44c4';
const USER_ID = 'google-oauth2|111548693083126671619'; // From previous session

async function testMemorySearch() {
  console.log('\n=== Memory Search Debug ===\n');

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
    console.log(`  - ${m.content} (strength: ${m.strength.toFixed(2)}, confidence: ${m.confidence})`);
  });

  // Test 2: Search with "masa" (should match)
  console.log('\nTest 2: Search with "masa"');
  const masaResults = await searchMemories({
    query: 'masa',
    userId: USER_ID,
    limit: 20,
    minStrength: 0.3,
  });
  console.log(`Found ${masaResults.length} memories`);
  masaResults.forEach((m) => {
    console.log(`  - ${m.content} (strength: ${m.strength.toFixed(2)}, confidence: ${m.confidence})`);
  });

  // Test 3: Search with "name" or "called" (partial match)
  console.log('\nTest 3: Search with "name"');
  const nameResults = await searchMemories({
    query: 'name',
    userId: USER_ID,
    limit: 20,
    minStrength: 0.3,
  });
  console.log(`Found ${nameResults.length} memories`);
  nameResults.forEach((m) => {
    console.log(`  - ${m.content} (strength: ${m.strength.toFixed(2)}, confidence: ${m.confidence})`);
  });

  // Test 4: Get ALL memories for user (no query filter)
  console.log('\nTest 4: Get ALL memories for user');
  const { getRecentMemories } = await import('../src/lib/memory/retrieval');
  const allMemories = await getRecentMemories(USER_ID, {
    limit: 50,
    minStrength: 0.0,
  });
  console.log(`Found ${allMemories.length} total memories`);
  allMemories.forEach((m) => {
    console.log(`  - ${m.content} (category: ${m.category}, strength: ${m.strength.toFixed(2)})`);
  });

  // Test 5: Check if specific memory exists
  console.log(`\nTest 5: Check for specific memory ID ${MEMORY_ID}`);
  const targetMemory = allMemories.find((m) => m.id === MEMORY_ID);
  if (targetMemory) {
    console.log('✅ Found target memory:');
    console.log(`   Content: ${targetMemory.content}`);
    console.log(`   Category: ${targetMemory.category}`);
    console.log(`   Strength: ${targetMemory.strength}`);
    console.log(`   Confidence: ${targetMemory.confidence}`);
    console.log(`   Importance: ${targetMemory.importance}`);
    console.log(`   Created: ${targetMemory.createdAt}`);
    console.log(`   Last Accessed: ${targetMemory.lastAccessed}`);
  } else {
    console.log('❌ Target memory NOT FOUND in results');
  }

  console.log('\n=== Analysis ===');
  console.log('The issue is likely:');
  console.log('1. BM25 keyword search requires keyword overlap');
  console.log('2. "hello" has no keywords in common with "Prefers to be called Masa"');
  console.log('3. Preference memories need semantic search OR always-include logic');
  console.log('\nSolutions:');
  console.log('- Add semantic search using Weaviate vector search');
  console.log('- OR: Always include high-importance preference memories');
  console.log('- OR: Use hybrid search (BM25 + vector)');
}

testMemorySearch().catch(console.error);
