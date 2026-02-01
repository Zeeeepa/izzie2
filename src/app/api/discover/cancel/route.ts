/**
 * POST /api/discover/cancel
 * Cancel the current discovery session
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import {
  getActiveAutonomousSession,
  cancelAutonomousTraining,
} from '@/lib/training/autonomous-training';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuthWithTestBypass(request);

    // Get active discovery session
    const session = await getActiveAutonomousSession(userId);

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No active discovery session found' },
        { status: 404 }
      );
    }

    // Cancel the session (marks as complete with completedAt timestamp)
    await cancelAutonomousTraining(session.id);

    console.log(`[Discover Cancel] Cancelled session ${session.id} for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Discovery session cancelled',
    });
  } catch (error) {
    console.error('[Discover Cancel] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel discovery',
      },
      { status: 500 }
    );
  }
}
