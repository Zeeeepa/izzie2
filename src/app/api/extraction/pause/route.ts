/**
 * POST /api/extraction/pause
 * Pause extraction for a specific source
 * Requires authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getOrCreateProgress,
  pauseExtraction,
  isExtractionActive,
  type ExtractionSource,
} from '@/lib/extraction/progress';

/**
 * POST /api/extraction/pause
 * Pause extraction for a specific source or all sources
 * - If source is provided, pause that specific source
 * - If no source is provided, pause all running extractions
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { source } = body as {
      source?: ExtractionSource;
    };

    // Case 1: Pause specific source
    if (source) {
      // Validate source
      if (!['email', 'calendar', 'drive'].includes(source)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid source. Must be: email, calendar, or drive',
          },
          { status: 400 }
        );
      }

      // Get or create progress record
      const progress = await getOrCreateProgress(session.user.id, source);

      // Check if extraction is actually running
      if (!isExtractionActive(progress)) {
        return NextResponse.json(
          {
            success: false,
            error: `Extraction is not running (status: ${progress.status}). Cannot pause.`,
            progress,
          },
          { status: 409 }
        );
      }

      // Pause extraction
      const updatedProgress = await pauseExtraction(session.user.id, source);

      return NextResponse.json({
        success: true,
        message: `Extraction paused for ${source}`,
        progress: updatedProgress,
      });
    }

    // Case 2: Pause all running extractions
    const sources: ExtractionSource[] = ['email', 'calendar', 'drive'];
    const pausedSources: ExtractionSource[] = [];
    const results: Record<string, any> = {};

    for (const src of sources) {
      try {
        const progress = await getOrCreateProgress(session.user.id, src);

        // Only pause if actually running
        if (isExtractionActive(progress)) {
          const updated = await pauseExtraction(session.user.id, src);
          pausedSources.push(src);
          results[src] = {
            success: true,
            previousStatus: 'running',
            currentStatus: updated.status,
          };
        } else {
          results[src] = {
            success: false,
            reason: `Not running (status: ${progress.status})`,
            currentStatus: progress.status,
          };
        }
      } catch (error) {
        results[src] = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    // Return results
    if (pausedSources.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No extractions were running',
        results,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Paused ${pausedSources.length} extraction(s): ${pausedSources.join(', ')}`,
      pausedSources,
      results,
    });
  } catch (error) {
    console.error('[Extraction Pause] Error:', error);

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
        error: error instanceof Error ? error.message : 'Failed to pause extraction',
      },
      { status: 500 }
    );
  }
}
