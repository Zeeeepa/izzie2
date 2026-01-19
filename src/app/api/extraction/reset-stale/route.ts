/**
 * POST /api/extraction/reset-stale
 * Reset stale (stuck) extractions that are marked as running but inactive
 * Requires authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { resetStaleExtractions } from '@/lib/extraction/progress';

/**
 * POST /api/extraction/reset-stale
 * Reset all stale extractions for debugging and recovery
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    await requireAuth(request);

    // Reset all stale extractions
    const resetCount = await resetStaleExtractions();

    return NextResponse.json({
      success: true,
      message: `Reset ${resetCount} stale extraction${resetCount !== 1 ? 's' : ''}`,
      resetCount,
    });
  } catch (error) {
    console.error('[Reset Stale] Error:', error);

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
        error: error instanceof Error ? error.message : 'Failed to reset stale extractions',
      },
      { status: 500 }
    );
  }
}
