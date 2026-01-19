/**
 * End-to-End Chat System Test
 * Tests all chat functionality with actual API calls
 */

import { dbClient } from '../src/lib/db';
import { users } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

const BASE_URL = 'http://localhost:3300';

interface TestResult {
  name: string;
  success: boolean;
  status?: number;
  response?: any;
  error?: string;
}

const results: TestResult[] = [];

async function getUserId(): Promise<string> {
  const db = dbClient.getDb();
  const [user] = await db
    .select()
    .from(users)
    .limit(1);

  if (!user) {
    throw new Error('No users found. Please create a test user first.');
  }

  console.log(`Using user: ${user.email} (${user.id})`);
  return user.id;
}

async function test1_createSession(userId: string): Promise<string | null> {
  console.log('\n[Test 1] Creating new chat session...');

  try {
    // Bypass auth for testing - directly call the session manager
    const { getSessionManager } = await import('../src/lib/chat/session');
    const sessionManager = getSessionManager();
    const storage = sessionManager['storage'];

    const session = await storage.createSession(userId, 'Test Chat Session');

    results.push({
      name: 'Test 1: Create Session',
      success: true,
      response: {
        id: session.id,
        title: session.title,
        messageCount: session.messageCount,
      },
    });

    console.log('✓ Session created:', session.id);
    return session.id;
  } catch (error) {
    results.push({
      name: 'Test 1: Create Session',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
    return null;
  }
}

async function test2_sendChatMessage(sessionId: string, userId: string): Promise<void> {
  console.log('\n[Test 2] Sending chat message (testing entity context)...');

  try {
    const { getChatHandler } = await import('../src/lib/chat');

    const chatHandler = getChatHandler();
    const result = await chatHandler.chat({
      message: 'Hi Izzie! What do you know about me and my contacts?',
      sessionId,
      userId,
    });

    const hasEntities = result.context?.entities && result.context.entities.length > 0;
    const hasMemories = result.context?.memories && result.context.memories.length > 0;

    results.push({
      name: 'Test 2: Send Message with Entity Context',
      success: true,
      response: {
        response: result.response.substring(0, 200) + '...',
        entityCount: result.context?.entities?.length || 0,
        memoryCount: result.context?.memories?.length || 0,
        hasEntities,
        hasMemories,
      },
    });

    console.log('✓ Message sent successfully');
    console.log(`  - Response length: ${result.response.length} chars`);
    console.log(`  - Entities referenced: ${result.context?.entities?.length || 0}`);
    console.log(`  - Memories referenced: ${result.context?.memories?.length || 0}`);
  } catch (error) {
    results.push({
      name: 'Test 2: Send Message with Entity Context',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
  }
}

async function test3_followUpQuestion(sessionId: string, userId: string): Promise<void> {
  console.log('\n[Test 3] Sending follow-up question (testing conversation continuity)...');

  try {
    const { getChatHandler } = await import('../src/lib/chat');

    const chatHandler = getChatHandler();
    const result = await chatHandler.chat({
      message: 'What projects am I working on?',
      sessionId,
      userId,
    });

    results.push({
      name: 'Test 3: Follow-up Question',
      success: true,
      response: {
        response: result.response.substring(0, 200) + '...',
        hasConversationHistory: result.context?.recentMessages && result.context.recentMessages.length > 1,
        messageCount: result.context?.recentMessages?.length || 0,
      },
    });

    console.log('✓ Follow-up sent successfully');
    console.log(`  - Recent messages: ${result.context?.recentMessages?.length || 0}`);
  } catch (error) {
    results.push({
      name: 'Test 3: Follow-up Question',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
  }
}

async function test4_taskRelatedQuestion(sessionId: string, userId: string): Promise<void> {
  console.log('\n[Test 4] Sending task-related question (testing current task tracking)...');

  try {
    const { getChatHandler } = await import('../src/lib/chat');

    const chatHandler = getChatHandler();
    const result = await chatHandler.chat({
      message: 'Help me plan a meeting with my team next week',
      sessionId,
      userId,
    });

    results.push({
      name: 'Test 4: Task-related Question',
      success: true,
      response: {
        response: result.response.substring(0, 200) + '...',
        hasCurrentTask: !!result.context?.currentTask,
        currentTask: result.context?.currentTask,
      },
    });

    console.log('✓ Task question sent successfully');
    console.log(`  - Current task set: ${!!result.context?.currentTask}`);
    if (result.context?.currentTask) {
      console.log(`  - Task goal: ${result.context.currentTask.goal}`);
    }
  } catch (error) {
    results.push({
      name: 'Test 4: Task-related Question',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
  }
}

async function test5_verifySessionSaved(userId: string): Promise<void> {
  console.log('\n[Test 5] Verifying session was saved...');

  try {
    const { getSessionManager } = await import('../src/lib/chat/session');
    const sessionManager = getSessionManager();

    const sessions = await sessionManager.getUserSessions(userId, 10);

    results.push({
      name: 'Test 5: Verify Session Saved',
      success: sessions.length > 0,
      response: {
        sessionCount: sessions.length,
        latestSession: sessions[0]
          ? {
              id: sessions[0].id,
              title: sessions[0].title,
              messageCount: sessions[0].messageCount,
              hasCurrentTask: !!sessions[0].currentTask,
            }
          : null,
      },
    });

    console.log('✓ Session verification complete');
    console.log(`  - Total sessions: ${sessions.length}`);
    if (sessions[0]) {
      console.log(`  - Latest session: ${sessions[0].id}`);
      console.log(`  - Message count: ${sessions[0].messageCount}`);
    }
  } catch (error) {
    results.push({
      name: 'Test 5: Verify Session Saved',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
  }
}

async function test6_getSessionDetails(sessionId: string): Promise<void> {
  console.log('\n[Test 6] Getting session details (verifying messages stored)...');

  try {
    const { getSessionManager } = await import('../src/lib/chat/session');
    const sessionManager = getSessionManager();

    const session = await sessionManager.getSession(sessionId);

    if (!session) {
      throw new Error('Session not found');
    }

    results.push({
      name: 'Test 6: Get Session Details',
      success: true,
      response: {
        id: session.id,
        title: session.title,
        messageCount: session.messageCount,
        hasCurrentTask: !!session.currentTask,
        hasRecentMessages: session.recentMessages.length > 0,
        recentMessageCount: session.recentMessages.length,
      },
    });

    console.log('✓ Session details retrieved');
    console.log(`  - Message count: ${session.messageCount}`);
    console.log(`  - Recent messages: ${session.recentMessages.length}`);
    console.log(`  - Has current task: ${!!session.currentTask}`);
  } catch (error) {
    results.push({
      name: 'Test 6: Get Session Details',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('✗ Failed:', error);
  }
}

async function printSummary(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  results.forEach((result, index) => {
    const icon = result.success ? '✓' : '✗';
    console.log(`${icon} ${result.name}`);

    if (!result.success && result.error) {
      console.log(`  Error: ${result.error}`);
    } else if (result.response) {
      console.log(`  Response:`, JSON.stringify(result.response, null, 2).split('\n').join('\n  '));
    }
    console.log('');
  });

  // Feature verification
  console.log('='.repeat(80));
  console.log('FEATURE VERIFICATION');
  console.log('='.repeat(80));

  const test2 = results.find((r) => r.name.includes('Test 2'));
  const test3 = results.find((r) => r.name.includes('Test 3'));
  const test4 = results.find((r) => r.name.includes('Test 4'));
  const test6 = results.find((r) => r.name.includes('Test 6'));

  console.log(`\n1. Entity Context: ${test2?.response?.hasEntities ? '✓' : '✗'}`);
  console.log(`2. Memory Context: ${test2?.response?.hasMemories ? '✓' : '✗'}`);
  console.log(`3. Session Persistence: ${test6?.success ? '✓' : '✗'}`);
  console.log(`4. Current Task Tracking: ${test4?.response?.hasCurrentTask ? '✓' : '✗'}`);
  console.log(`5. Message Window: ${test6?.response?.hasRecentMessages ? '✓' : '✗'}`);
  console.log('');
}

async function main() {
  console.log('='.repeat(80));
  console.log('CHAT SYSTEM END-TO-END TEST');
  console.log('='.repeat(80));

  try {
    // Get test user
    const userId = await getUserId();
    console.log(`\nUsing test user: ${userId}`);

    // Run tests sequentially
    const sessionId = await test1_createSession(userId);

    if (sessionId) {
      await test2_sendChatMessage(sessionId, userId);
      await test3_followUpQuestion(sessionId, userId);
      await test4_taskRelatedQuestion(sessionId, userId);
      await test5_verifySessionSaved(userId);
      await test6_getSessionDetails(sessionId);
    } else {
      console.error('\n✗ Cannot continue tests - session creation failed');
    }

    // Print summary
    await printSummary();
  } catch (error) {
    console.error('\nFatal error:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
