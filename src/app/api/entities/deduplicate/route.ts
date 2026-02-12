/**
 * Entity Deduplication API
 *
 * POST /api/entities/deduplicate
 * - Finds and processes duplicate entities
 * - Auto-applies merges with confidence >= 0.95
 * - Creates manual review suggestions for 0.7 <= confidence < 0.95
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { findAndProcessDuplicates } from '@/lib/entities/deduplication';
import { getMergeStats } from '@/lib/entities/merge-service';

/**
 * POST /api/entities/deduplicate
 * Find and process duplicate entities with autonomous merging
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Parse request body for configuration
    const body = await req.json().catch(() => ({}));
    const minConfidence = body.minConfidence ?? 0.7;

    console.log(`[Deduplicate API] Processing duplicates for user ${userId}...`);

    // Find and process duplicates
    const result = await findAndProcessDuplicates(userId, minConfidence);

    // Get updated merge statistics
    const stats = await getMergeStats(userId);

    console.log(
      `[Deduplicate API] Completed: ${result.autoApplied} auto-applied, ${result.pendingReview} pending review`
    );

    return NextResponse.json({
      success: true,
      result,
      stats,
      message: `Processed ${result.totalFound} duplicates: ${result.autoApplied} auto-merged, ${result.pendingReview} pending review`,
    });
  } catch (error) {
    console.error('[Deduplicate API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process duplicates',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/entities/deduplicate
 * Get merge statistics for the current user
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get merge statistics
    const stats = await getMergeStats(userId);

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[Deduplicate API] Error getting stats:', error);
    return NextResponse.json(
      {
        error: 'Failed to get merge statistics',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
