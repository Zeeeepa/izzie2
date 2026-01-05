/**
 * Memory Retrieve API Route
 *
 * GET /api/memory/retrieve
 * Retrieve memories by ID or get all for a user
 *
 * Query parameters:
 * - userId: string (required for getAll)
 * - memoryId?: string - specific memory ID
 * - limit?: number - max results for getAll (default: 100)
 * - conversationId?: string - filter by conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import { memoryService } from '@/lib/memory';

/**
 * GET /api/memory/retrieve
 * Retrieve memory by ID or get all for user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const memoryId = searchParams.get('memoryId');
    const userId = searchParams.get('userId');

    // Case 1: Retrieve specific memory by ID
    if (memoryId) {
      const memory = await memoryService.getById(memoryId);

      if (!memory) {
        return NextResponse.json(
          {
            error: 'Memory not found',
            memoryId,
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        status: 'success',
        memory,
      });
    }

    // Case 2: Get all memories for a user
    if (userId) {
      const limit = parseInt(searchParams.get('limit') || '100', 10);
      const conversationId = searchParams.get('conversationId') || undefined;

      const memories = await memoryService.getAll(userId, {
        limit,
        conversationId,
      });

      // Get stats
      const stats = await memoryService.getStats(userId);

      return NextResponse.json({
        status: 'success',
        memories,
        count: memories.length,
        stats,
        options: {
          limit,
          conversationId,
        },
      });
    }

    // Missing required parameters
    return NextResponse.json(
      {
        error: 'Missing required parameters',
        message: 'Either memoryId or userId is required',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] Memory retrieve error:', error);

    return NextResponse.json(
      {
        error: 'Retrieve failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/memory/retrieve
 * Delete a memory by ID
 *
 * Query parameters:
 * - memoryId: string (required)
 * - hard?: boolean - hard delete (default: false)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const memoryId = searchParams.get('memoryId');
    const hard = searchParams.get('hard') === 'true';

    if (!memoryId) {
      return NextResponse.json(
        {
          error: 'Missing required parameter',
          message: 'memoryId is required',
        },
        { status: 400 }
      );
    }

    await memoryService.delete(memoryId, hard);

    return NextResponse.json({
      status: 'success',
      memoryId,
      hard,
      message: `Memory ${hard ? 'permanently deleted' : 'soft deleted'}`,
    });
  } catch (error) {
    console.error('[API] Memory delete error:', error);

    return NextResponse.json(
      {
        error: 'Delete failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
