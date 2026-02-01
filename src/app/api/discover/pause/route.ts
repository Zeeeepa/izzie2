/**
 * POST /api/discover/pause
 * Pause the current discovery session
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import {
  getActiveAutonomousSession,
  pauseAutonomousTraining,
  getAutonomousStatus,
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

    if (session.status === 'paused') {
      return NextResponse.json({
        success: true,
        message: 'Discovery session is already paused',
        session: {
          id: session.id,
          status: 'paused',
        },
      });
    }

    if (session.status !== 'running') {
      return NextResponse.json(
        { success: false, error: `Cannot pause session with status: ${session.status}` },
        { status: 400 }
      );
    }

    // Pause the session
    await pauseAutonomousTraining(session.id);

    console.log(`[Discover Pause] Paused session ${session.id} for user ${userId}`);

    // Get updated status
    const status = await getAutonomousStatus(session.id);

    return NextResponse.json({
      success: true,
      message: 'Discovery session paused',
      session: {
        id: session.id,
        status: 'paused',
      },
      budget: status.budget,
      progress: status.progress,
    });
  } catch (error) {
    console.error('[Discover Pause] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pause discovery',
      },
      { status: 500 }
    );
  }
}
