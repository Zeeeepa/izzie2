/**
 * GET /api/train/status
 * Get current training session status
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import {
  getActiveSession,
  getTrainingStats,
  getPendingSamplesCount,
} from '@/lib/training';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuthWithTestBypass(request);

    // Get active training session
    const trainingSession = await getActiveSession(userId);

    if (!trainingSession) {
      return NextResponse.json({
        success: true,
        hasActiveSession: false,
        session: null,
        stats: null,
        pendingSamples: 0,
      });
    }

    // Get training stats
    const stats = await getTrainingStats(trainingSession.id);
    const pendingSamples = await getPendingSamplesCount(trainingSession.id);

    return NextResponse.json({
      success: true,
      hasActiveSession: true,
      session: trainingSession,
      stats,
      pendingSamples,
    });
  } catch (error) {
    console.error('[Train Status] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get training status',
      },
      { status: 500 }
    );
  }
}
