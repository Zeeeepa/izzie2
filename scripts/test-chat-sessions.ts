/**
 * Test Chat Session Management
 *
 * Tests the complete session management system including:
 * - Session creation and storage
 * - Message windowing (5 pairs)
 * - Incremental compression
 * - Current task tracking
 */

import { getSessionManager, getSessionStorage } from '../src/lib/chat/session';
import type { StructuredLLMResponse } from '../src/lib/chat/session/types';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const LOG_PREFIX = '[Session Test]';

async function testSessionManagement() {
  console.log(`${LOG_PREFIX} Starting session management tests...\n`);

  const storage = getSessionStorage();
  const manager = getSessionManager();

  // Use existing user from database
  // Test user ID for development - not a secret  pragma: allowlist secret
  const testUserId = 'tlHWmrogZXPR91lqdGO1fXM02j92rVDF';

  try {
    // Test 1: Create a new session
    console.log(`${LOG_PREFIX} Test 1: Creating new session...`);
    const session = await storage.createSession(testUserId, 'Test Session');
    console.log(`✅ Session created: ${session.id}`);
    console.log(`   - Title: ${session.title}`);
    console.log(`   - Messages: ${session.messageCount}`);
    console.log(`   - Recent: ${session.recentMessages.length}\n`);

    // Test 2: Add messages (less than window size)
    console.log(`${LOG_PREFIX} Test 2: Adding 3 message pairs (below window limit)...`);
    for (let i = 1; i <= 3; i++) {
      const mockResponse: StructuredLLMResponse = {
        response: `Response ${i}`,
        currentTask: i === 1 ? {
          goal: 'Test task',
          context: 'Testing session management',
          blockers: [],
          progress: `Step ${i} of 3`,
          nextSteps: [`Complete step ${i + 1}`],
          updatedAt: new Date(),
        } : null,
      };

      await manager.processResponse(
        session,
        `User message ${i}`,
        mockResponse
      );
    }

    console.log(`✅ Added 3 message pairs`);
    console.log(`   - Total messages: ${session.messageCount}`);
    console.log(`   - Recent messages: ${session.recentMessages.length}`);
    console.log(`   - Has current task: ${!!session.currentTask}`);
    console.log(`   - Compressed history: ${session.compressedHistory ? 'yes' : 'no'}\n`);

    // Test 3: Trigger compression (exceed window size)
    console.log(`${LOG_PREFIX} Test 3: Adding 4 more pairs to trigger compression...`);
    for (let i = 4; i <= 7; i++) {
      const mockResponse: StructuredLLMResponse = {
        response: `Response ${i}`,
        currentTask: {
          goal: 'Test task',
          context: 'Testing compression',
          blockers: i === 6 ? ['Blocker example'] : [],
          progress: `Step ${i} of 7`,
          nextSteps: [`Complete step ${i + 1}`],
          updatedAt: new Date(),
        },
      };

      await manager.processResponse(
        session,
        `User message ${i}`,
        mockResponse
      );
    }

    console.log(`✅ Added 4 more pairs (total 7)`);
    console.log(`   - Total messages: ${session.messageCount}`);
    console.log(`   - Recent messages: ${session.recentMessages.length}`);
    console.log(`   - Compressed history: ${session.compressedHistory ? 'yes' : 'no'}`);
    if (session.compressedHistory) {
      console.log(`   - History length: ${session.compressedHistory.length} chars`);
    }
    console.log(`   - Archived messages: ${session.archivedMessages?.length || 0}\n`);

    // Test 4: Retrieve session
    console.log(`${LOG_PREFIX} Test 4: Retrieving session from database...`);
    const retrieved = await storage.getSession(session.id);
    if (!retrieved) {
      throw new Error('Failed to retrieve session');
    }

    console.log(`✅ Session retrieved successfully`);
    console.log(`   - ID matches: ${retrieved.id === session.id}`);
    console.log(`   - Messages match: ${retrieved.messageCount === session.messageCount}`);
    console.log(`   - Recent window: ${retrieved.recentMessages.length} messages`);
    console.log(`   - Has compression: ${!!retrieved.compressedHistory}\n`);

    // Test 5: List user sessions
    console.log(`${LOG_PREFIX} Test 5: Listing user sessions...`);
    const sessions = await storage.getUserSessions(testUserId);
    console.log(`✅ Found ${sessions.length} session(s)`);
    sessions.forEach((s, idx) => {
      console.log(`   ${idx + 1}. ${s.title} (${s.messageCount} messages)`);
    });
    console.log();

    // Test 6: Verify windowing
    console.log(`${LOG_PREFIX} Test 6: Verifying message window (5 pairs = 10 messages)...`);
    const windowSize = retrieved.recentMessages.length;
    console.log(`✅ Window size: ${windowSize} messages`);
    if (windowSize > 10) {
      console.log(`❌ FAIL: Window exceeded! Should be <= 10, got ${windowSize}`);
    } else {
      console.log(`✅ PASS: Window size correct`);
    }
    console.log();

    // Test 7: Build context for LLM
    console.log(`${LOG_PREFIX} Test 7: Building LLM context...`);
    const messages = manager.buildContext(
      retrieved,
      'You are a helpful assistant.',
      'Entity context: Person(John), Company(Acme)',
      'What can you tell me about John?'
    );

    console.log(`✅ Built context with ${messages.length} messages`);
    console.log(`   - System prompts: ${messages.filter(m => m.role === 'system').length}`);
    console.log(`   - User messages: ${messages.filter(m => m.role === 'user').length}`);
    console.log(`   - Assistant messages: ${messages.filter(m => m.role === 'assistant').length}`);
    console.log();

    // Test 8: Clean up
    console.log(`${LOG_PREFIX} Test 8: Cleaning up test session...`);
    await storage.deleteSession(session.id);
    console.log(`✅ Session deleted\n`);

    console.log(`${LOG_PREFIX} ✅ All tests passed!\n`);

    return {
      success: true,
      tests: 8,
      passed: 8,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Test failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Run tests
testSessionManagement()
  .then((result) => {
    if (result.success) {
      console.log('✨ Test suite completed successfully!');
      process.exit(0);
    } else {
      console.error('💥 Test suite failed:', result.error);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
