/**
 * Memory Search API Route
 *
 * GET /api/memory/search
 * Search memories using semantic similarity
 *
 * Query parameters:
 * - userId: string (required)
 * - query: string (required) - search query
 * - limit?: number - max results (default: 10)
 * - threshold?: number - similarity threshold 0-1 (default: 0.7)
 * - conversationId?: string - filter by conversation
 * - minImportance?: number - minimum importance (default: 1)
 * - includeGraph?: boolean - include graph results (default: false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { memoryService } from '@/lib/memory';

/**
 * GET /api/memory/search
 * Search memories using vector similarity
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // Get required parameters
    const userId = searchParams.get('userId');
    const query = searchParams.get('query');

    if (!userId || !query) {
      return NextResponse.json(
        {
          error: 'Missing required parameters',
          message: 'userId and query are required',
        },
        { status: 400 }
      );
    }

    // Get optional parameters
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');
    const conversationId = searchParams.get('conversationId') || undefined;
    const minImportance = parseInt(searchParams.get('minImportance') || '1', 10);
    const includeGraph = searchParams.get('includeGraph') === 'true';

    // Perform search
    let results;
    if (includeGraph) {
      // Hybrid search (vector + graph)
      results = await memoryService.hybridSearch(userId, query, {
        limit,
        threshold,
        conversationId,
        minImportance,
        includeGraph: true,
      });
    } else {
      // Vector search only
      const memories = await memoryService.retrieve(userId, query, {
        limit,
        threshold,
        conversationId,
        minImportance,
      });

      results = {
        memories,
        count: memories.length,
      };
    }

    return NextResponse.json({
      status: 'success',
      ...results,
      query,
      options: {
        limit,
        threshold,
        conversationId,
        minImportance,
        includeGraph,
      },
    });
  } catch (error) {
    console.error('[API] Memory search error:', error);

    return NextResponse.json(
      {
        error: 'Search failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
