/**
 * GET /api/discover/status
 * Get current discovery session status (days processed, items found, budget remaining, current activity)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import {
  getActiveAutonomousSession,
  getAutonomousStatus,
} from '@/lib/training/autonomous-training';
import { dbClient } from '@/lib/db';
import { trainingSamples } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuthWithTestBypass(request);

    // Get active discovery session
    const session = await getActiveAutonomousSession(userId);

    if (!session) {
      return NextResponse.json({
        success: true,
        hasActiveSession: false,
        session: null,
        status: null,
        feedbackStats: {
          total: 0,
          reviewed: 0,
          pending: 0,
        },
      });
    }

    // Get detailed status
    const status = await getAutonomousStatus(session.id);

    // Get feedback statistics
    const db = dbClient.getDb();
    const feedbackStats = await db
      .select({
        total: sql<number>`count(*)`,
        reviewed: sql<number>`count(case when ${trainingSamples.status} = 'reviewed' then 1 end)`,
        pending: sql<number>`count(case when ${trainingSamples.status} = 'pending' then 1 end)`,
      })
      .from(trainingSamples)
      .where(eq(trainingSamples.sessionId, session.id));

    return NextResponse.json({
      success: true,
      hasActiveSession: true,
      session: {
        id: session.id,
        status: status.status,
        mode: session.mode,
        createdAt: session.createdAt,
      },
      // Legacy budget field (same as discoveryBudget for backward compatibility)
      budget: status.budget,
      // Separate budgets
      discoveryBudget: status.discoveryBudget,
      trainingBudget: status.trainingBudget,
      progress: {
        ...status.progress,
        currentActivity: session.status === 'running' ? 'Processing emails and calendar events...' : undefined,
      },
      feedbackStats: {
        total: feedbackStats[0]?.total || 0,
        reviewed: feedbackStats[0]?.reviewed || 0,
        pending: feedbackStats[0]?.pending || 0,
      },
      startedAt: status.startedAt,
      completedAt: status.completedAt,
    });
  } catch (error) {
    console.error('[Discover Status] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get discovery status',
      },
      { status: 500 }
    );
  }
}
