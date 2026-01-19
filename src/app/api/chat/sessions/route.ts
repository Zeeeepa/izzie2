/**
 * Chat Sessions API
 * GET /api/chat/sessions - List user's sessions
 * POST /api/chat/sessions - Create new session
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getSessionManager } from '@/lib/chat/session';

const LOG_PREFIX = '[Sessions API]';

/**
 * GET /api/chat/sessions
 * List user's chat sessions (most recent first)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    console.log(`${LOG_PREFIX} Fetching sessions for user ${userId} (limit: ${limit})`);

    // Get sessions
    const sessionManager = getSessionManager();
    const sessions = await sessionManager.getUserSessions(userId, limit);

    // Format response
    const formattedSessions = sessions.map((s) => ({
      id: s.id,
      title: s.title || 'Untitled Chat',
      messageCount: s.messageCount,
      hasCurrentTask: !!s.currentTask,
      currentTask: s.currentTask
        ? {
            goal: s.currentTask.goal,
            progress: s.currentTask.progress,
          }
        : null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    console.log(`${LOG_PREFIX} Returning ${formattedSessions.length} sessions`);

    return NextResponse.json({
      sessions: formattedSessions,
      count: formattedSessions.length,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching sessions:`, error);
    return NextResponse.json(
      {
        error: 'Failed to fetch sessions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat/sessions
 * Create a new chat session
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse request body (optional title)
    const body = await request.json().catch(() => ({}));
    const { title } = body;

    console.log(`${LOG_PREFIX} Creating new session for user ${userId}`);

    // Create session
    const sessionManager = getSessionManager();
    const storage = sessionManager['storage']; // Access private storage via bracket notation
    const newSession = await storage.createSession(userId, title);

    console.log(`${LOG_PREFIX} Created session ${newSession.id}`);

    return NextResponse.json({
      session: {
        id: newSession.id,
        title: newSession.title || 'Untitled Chat',
        messageCount: newSession.messageCount,
        createdAt: newSession.createdAt.toISOString(),
        updatedAt: newSession.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating session:`, error);
    return NextResponse.json(
      {
        error: 'Failed to create session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
