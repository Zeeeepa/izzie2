/**
 * POST /api/extraction/reset
 * Reset extraction progress for a specific source
 * Clears all counters and sets status to idle
 * Optionally clears extracted entities for that source
 * Requires authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getOrCreateProgress,
  resetProgress,
  type ExtractionSource,
} from '@/lib/extraction/progress';
import { db } from '@/lib/db';
import { entities } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * POST /api/extraction/reset
 * Reset extraction progress for a specific source
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { source, clearEntities = false } = body as {
      source?: ExtractionSource;
      clearEntities?: boolean;
    };

    // Validate source
    if (!source || !['email', 'calendar', 'drive'].includes(source)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid source. Must be: email, calendar, or drive',
        },
        { status: 400 }
      );
    }

    // Get or create progress record (to ensure it exists)
    await getOrCreateProgress(session.user.id, source);

    // Reset progress
    const updatedProgress = await resetProgress(session.user.id, source);

    // Optionally clear extracted entities
    let entitiesCleared = 0;
    if (clearEntities) {
      // Map source to entity source string
      const entitySource = `${source}_extraction`;

      const result = await db
        .delete(entities)
        .where(
          and(
            eq(entities.userId, session.user.id),
            eq(entities.source, entitySource)
          )
        );

      // Drizzle returns undefined for delete operations, so we'll log instead
      console.log(
        `[Extraction Reset] Cleared entities for user ${session.user.id}, source ${entitySource}`
      );
    }

    return NextResponse.json({
      success: true,
      message: `Extraction reset for ${source}`,
      progress: updatedProgress,
      entitiesCleared: clearEntities ? entitiesCleared : undefined,
    });
  } catch (error) {
    console.error('[Extraction Reset] Error:', error);

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
        error: error instanceof Error ? error.message : 'Failed to reset extraction',
      },
      { status: 500 }
    );
  }
}
