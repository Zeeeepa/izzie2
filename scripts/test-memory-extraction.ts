/**
 * Test Memory Extraction Script
 *
 * Tests the memory extraction system with sample emails and verifies:
 * - Memory extraction from text
 * - Temporal decay calculations
 * - Memory storage in Weaviate
 * - Memory retrieval with decay-weighted relevance
 *
 * Usage:
 *   npx tsx scripts/test-memory-extraction.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { extractMemoriesFromEmail } from '@/lib/memory/extraction';
import { saveMemories, getMemoryStats } from '@/lib/memory/storage';
import { searchMemories, getRecentMemories } from '@/lib/memory/retrieval';
import { calculateMemoryStrength, getDecayStats } from '@/lib/memory/decay';
import { initializeMemorySchema } from '@/lib/memory/storage';
import type { Email } from '@/lib/google/types';
import type { CreateMemoryInput } from '@/lib/memory/types';

const LOG_PREFIX = '[TestMemory]';

// Sample test emails
const testEmails: Email[] = [
  {
    id: 'test-1',
    subject: 'Q4 Planning Meeting',
    body: `Hi team,

Let's schedule our Q4 planning meeting for next Tuesday at 10am. We need to discuss:
- Budget allocation for next quarter
- New feature priorities
- Team capacity planning

Sarah, you mentioned you prefer morning meetings, so this should work well for you.

Looking forward to our discussion!`,
    from: { name: 'John Manager', email: 'john@example.com' },
    to: [
      { name: 'Sarah Developer', email: 'sarah@example.com' },
      { name: 'Mike Designer', email: 'mike@example.com' },
    ],
    date: new Date('2026-01-17T09:00:00Z'),
    threadId: 'thread-1',
    labels: ['INBOX'],
    snippet: 'Q4 planning meeting scheduled...',
    isSent: true,
    hasAttachments: false,
    internalDate: Date.now(),
  },
  {
    id: 'test-2',
    subject: 'Re: Database Migration',
    body: `After discussing with the team, we've decided to go with PostgreSQL instead of MongoDB for the new analytics service.

The main reasons:
- Better query performance for our use case
- Stronger ACID guarantees
- Team has more experience with SQL

We'll start the migration next Monday. The plan is to have everything done by end of month.`,
    from: { name: 'Alice Tech Lead', email: 'alice@example.com' },
    to: [{ name: 'Bob DevOps', email: 'bob@example.com' }],
    date: new Date('2026-01-15T14:30:00Z'),
    threadId: 'thread-2',
    labels: ['INBOX'],
    snippet: 'Database migration decision...',
    isSent: false,
    hasAttachments: false,
    internalDate: Date.now(),
  },
  {
    id: 'test-3',
    subject: 'Vacation Notice',
    body: `Hey everyone,

Just a heads up that I'll be on vacation from January 25th to February 5th. I'll have limited access to email.

For urgent matters, please contact Sarah who will be covering for me.

Thanks!`,
    from: { name: 'Chris Developer', email: 'chris@example.com' },
    to: [{ name: 'Team', email: 'team@example.com' }],
    date: new Date('2026-01-16T11:00:00Z'),
    threadId: 'thread-3',
    labels: ['INBOX'],
    snippet: 'Vacation notice...',
    isSent: true,
    hasAttachments: false,
    internalDate: Date.now(),
  },
];

/**
 * Test memory extraction
 */
async function testExtraction() {
  console.log(`\n${LOG_PREFIX} Testing memory extraction...`);

  const email = testEmails[0];
  console.log(`${LOG_PREFIX} Email: "${email.subject}"`);

  const result = await extractMemoriesFromEmail(email);

  console.log(`${LOG_PREFIX} Extracted ${result.memories.length} memories:`);
  result.memories.forEach((memory, i) => {
    console.log(`\n  Memory ${i + 1}:`);
    console.log(`    Category: ${memory.category}`);
    console.log(`    Content: ${memory.content}`);
    console.log(`    Importance: ${memory.importance.toFixed(2)}`);
    console.log(`    Confidence: ${memory.confidence.toFixed(2)}`);
    if (memory.relatedEntities && memory.relatedEntities.length > 0) {
      console.log(`    Related: ${memory.relatedEntities.join(', ')}`);
    }
    if (memory.tags && memory.tags.length > 0) {
      console.log(`    Tags: ${memory.tags.join(', ')}`);
    }
  });

  console.log(`\n${LOG_PREFIX} Cost: $${result.cost.toFixed(6)}`);

  return result;
}

/**
 * Test memory storage
 */
async function testStorage(userId: string) {
  console.log(`\n${LOG_PREFIX} Testing memory storage...`);

  // Extract memories from all test emails
  const allMemories: CreateMemoryInput[] = [];

  for (const email of testEmails) {
    const result = await extractMemoriesFromEmail(email);

    const memoryInputs: CreateMemoryInput[] = result.memories.map((m) => ({
      userId,
      content: m.content,
      category: m.category,
      sourceType: 'email',
      sourceId: email.id,
      sourceDate: email.date,
      importance: m.importance,
      confidence: m.confidence,
      relatedEntities: m.relatedEntities,
      tags: m.tags,
      expiresAt: m.expiresAt,
    }));

    allMemories.push(...memoryInputs);
  }

  console.log(`${LOG_PREFIX} Saving ${allMemories.length} memories...`);
  const saved = await saveMemories(allMemories);

  console.log(`${LOG_PREFIX} Saved ${saved.length} memories to Weaviate`);

  return saved;
}

/**
 * Test memory retrieval
 */
async function testRetrieval(userId: string) {
  console.log(`\n${LOG_PREFIX} Testing memory retrieval...`);

  // Test search
  console.log(`\n${LOG_PREFIX} Searching for "meeting"...`);
  const searchResults = await searchMemories({
    query: 'meeting',
    userId,
    limit: 10,
    minStrength: 0.5,
  });

  console.log(`${LOG_PREFIX} Found ${searchResults.length} memories:`);
  searchResults.slice(0, 3).forEach((memory) => {
    console.log(`\n  Content: ${memory.content}`);
    console.log(`  Category: ${memory.category}`);
    console.log(`  Strength: ${memory.strength.toFixed(2)}`);
    console.log(`  Age: ${memory.ageInDays.toFixed(1)} days`);
  });

  // Test recent memories
  console.log(`\n${LOG_PREFIX} Getting recent memories...`);
  const recentResults = await getRecentMemories(userId, {
    limit: 5,
    minStrength: 0.3,
  });

  console.log(`${LOG_PREFIX} Found ${recentResults.length} recent memories`);

  return { searchResults, recentResults };
}

/**
 * Test temporal decay
 */
async function testDecay(userId: string) {
  console.log(`\n${LOG_PREFIX} Testing temporal decay...`);

  // Get all memories
  const memories = await getRecentMemories(userId, { limit: 100 });

  console.log(`${LOG_PREFIX} Analyzing ${memories.length} memories...`);

  const stats = getDecayStats(
    memories.map((m) => {
      const { strength, ageInDays, daysSinceAccess, ...memory } = m;
      return memory;
    })
  );

  console.log(`\n${LOG_PREFIX} Decay Statistics:`);
  console.log(`  Total memories: ${stats.total}`);
  console.log(`  Average strength: ${stats.avgStrength.toFixed(2)}`);
  console.log(`  Strong (≥0.7): ${stats.strongMemories}`);
  console.log(`  Fading (0.3-0.7): ${stats.fadingMemories}`);
  console.log(`  Weak (<0.3): ${stats.weakMemories}`);
  console.log(`  Avg half-life: ${stats.avgHalfLife.toFixed(1)} days`);

  return stats;
}

/**
 * Main test execution
 */
async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${LOG_PREFIX} Memory Extraction System Test`);
  console.log(`${'='.repeat(80)}\n`);

  const testUserId = 'test-user-123';

  try {
    // Initialize schema
    console.log(`${LOG_PREFIX} Initializing Memory schema...`);
    await initializeMemorySchema();
    console.log(`${LOG_PREFIX} ✅ Schema initialized\n`);

    // Test 1: Extraction
    await testExtraction();

    // Test 2: Storage
    await testStorage(testUserId);

    // Test 3: Retrieval
    await testRetrieval(testUserId);

    // Test 4: Temporal Decay
    await testDecay(testUserId);

    // Test 5: Memory Stats
    console.log(`\n${LOG_PREFIX} Getting memory statistics...`);
    const stats = await getMemoryStats(testUserId);
    console.log(`\n${LOG_PREFIX} Memory Statistics:`);
    console.log(`  Total: ${stats.total}`);
    console.log(`  By Category:`, stats.byCategory);
    console.log(`  By Source:`, stats.bySource);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`${LOG_PREFIX} ✅ All tests completed successfully!`);
    console.log(`${'='.repeat(80)}\n`);

    process.exit(0);
  } catch (error) {
    console.error(`\n${LOG_PREFIX} ❌ Test failed:`, error);
    process.exit(1);
  }
}

// Run the test
main();
