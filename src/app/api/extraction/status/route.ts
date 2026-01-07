/**
 * GET /api/extraction/status
 * Returns extraction progress for all sources (email, calendar, drive)
 * Requires authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getAllProgress, calculateProgress } from '@/lib/extraction/progress';

/**
 * GET /api/extraction/status
 * Returns progress for all sources for current user
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);

    // Get all progress records for user
    const allProgress = await getAllProgress(session.user.id);

    // Transform to include calculated progress percentage
    const progressWithPercentage = allProgress.map((progress) => ({
      ...progress,
      progressPercentage: calculateProgress(progress),
    }));

    return NextResponse.json({
      success: true,
      progress: progressWithPercentage,
    });
  } catch (error) {
    console.error('[Extraction Status] Error:', error);

    // Handle authentication errors
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get extraction status',
      },
      { status: 500 }
    );
  }
}
