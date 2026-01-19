/**
 * Test script for web search infrastructure
 * Usage: npx tsx scripts/test-search.ts
 */

import { webSearch, fetchAndCache, getCacheStats, pruneExpiredCache } from '../src/lib/search/index.js';
import { createTask } from '../src/agents/base/task-manager.js';

async function main() {
  console.log('🔍 Testing Web Search Infrastructure\n');

  // Check environment
  if (!process.env.BRAVE_SEARCH_API_KEY) {
    console.warn('⚠️  BRAVE_SEARCH_API_KEY not set. Set it in .env.local');
    console.log('   Search operations will fail without API key.\n');
  }

  try {
    // Test 1: Web Search
    console.log('1️⃣  Testing web search...');
    const searchResults = await webSearch('TypeScript best practices 2024', {
      maxResults: 3,
    });

    console.log(`   Found ${searchResults.length} results:`);
    for (const result of searchResults) {
      console.log(`   - ${result.title}`);
      console.log(`     ${result.url}`);
      console.log(`     ${result.snippet.substring(0, 100)}...`);
    }
    console.log('');

    // Test 2: Create a test task
    console.log('2️⃣  Creating test research task...');
    const task = await createTask(
      'research',
      'test-user',
      {
        query: 'TypeScript best practices 2024',
        maxSources: 3,
      },
      {
        totalSteps: 5,
      }
    );
    console.log(`   Created task: ${task.id}`);
    console.log('');

    // Test 3: Fetch and cache content
    if (searchResults.length > 0) {
      console.log('3️⃣  Testing fetch and cache...');
      const firstResult = searchResults[0];

      console.log(`   Fetching: ${firstResult.url}`);
      const fetchResult = await fetchAndCache(task.id, firstResult.url, {
        timeout: 15000,
      });

      console.log(`   Title: ${fetchResult.title || 'N/A'}`);
      console.log(`   Content type: ${fetchResult.contentType}`);
      console.log(`   Content length: ${fetchResult.content.length} chars`);
      console.log(`   Content preview: ${fetchResult.content.substring(0, 200)}...`);

      if (fetchResult.error) {
        console.log(`   ⚠️  Error: ${fetchResult.error}`);
      }
      console.log('');

      // Test 4: Check cache
      console.log('4️⃣  Testing cache retrieval...');
      const cachedResult = await fetchAndCache(task.id, firstResult.url);

      console.log(`   Retrieved from cache: ${cachedResult.url}`);
      console.log(`   Content length: ${cachedResult.content.length} chars`);
      console.log('');
    }

    // Test 5: Cache stats
    console.log('5️⃣  Cache statistics...');
    const stats = await getCacheStats(task.id);
    console.log(`   Total: ${stats.total}`);
    console.log(`   Fetched: ${stats.fetched}`);
    console.log(`   Pending: ${stats.pending}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`   Expired: ${stats.expired}`);
    console.log('');

    // Test 6: Prune expired cache
    console.log('6️⃣  Pruning expired cache...');
    const pruned = await pruneExpiredCache();
    console.log(`   Pruned ${pruned} expired entries`);
    console.log('');

    console.log('✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
