/**
 * Memory Test API Route
 *
 * Tests the complete memory system:
 * - Vector embedding generation
 * - pgvector storage and retrieval
 * - Semantic search
 * - Hybrid search (vector + graph)
 *
 * Should NOT be deployed to production - development only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { memoryService } from '@/lib/memory';
import { dbClient } from '@/lib/db';

/**
 * GET /api/memory/test
 * Run comprehensive memory system tests
 */
export async function GET() {
  // Block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Test endpoint not available in production' },
      { status: 403 }
    );
  }

  const results: any = {
    status: 'starting',
    checks: {},
    errors: [],
  };

  try {
    // Check 1: Database connection
    results.checks.dbConnected = await dbClient.verifyConnection();
    if (!results.checks.dbConnected) {
      results.errors.push('Database connection failed');
    }

    // Check 2: Store test memories
    const testUserId = 'test-user-memory';
    const testMemories = [
      {
        content: 'User prefers dark mode for the UI',
        importance: 8,
        summary: 'UI preference',
      },
      {
        content: 'User is working on a React project with TypeScript',
        importance: 7,
        summary: 'Project context',
      },
      {
        content: 'User mentioned they love semantic search',
        importance: 6,
        summary: 'User preference',
      },
    ];

    const stored = [];
    try {
      for (const mem of testMemories) {
        const result = await memoryService.store(
          {
            userId: testUserId,
            content: mem.content,
            metadata: { test: true },
          },
          {
            importance: mem.importance,
            summary: mem.summary,
          }
        );
        stored.push(result);
      }
      results.checks.storeMemories = true;
      results.storedMemories = stored.map((m) => ({ id: m.id, content: m.content }));
    } catch (error) {
      results.checks.storeMemories = false;
      results.errors.push(`Store memories failed: ${error}`);
    }

    // Check 3: Semantic search
    try {
      const searchQuery = 'What are the user preferences?';
      const searchResults = await memoryService.retrieve(testUserId, searchQuery, {
        limit: 5,
        threshold: 0.5,
      });

      results.checks.semanticSearch = searchResults.length > 0;
      results.searchResults = searchResults.map((r) => ({
        id: r.id,
        content: r.content,
        similarity: r.metadata?.similarity,
      }));
    } catch (error) {
      results.checks.semanticSearch = false;
      results.errors.push(`Semantic search failed: ${error}`);
    }

    // Check 4: Get all memories
    try {
      const allMemories = await memoryService.getAll(testUserId, { limit: 10 });
      results.checks.getAllMemories = allMemories.length === testMemories.length;
      results.allMemories = {
        count: allMemories.length,
        expected: testMemories.length,
      };
    } catch (error) {
      results.checks.getAllMemories = false;
      results.errors.push(`Get all memories failed: ${error}`);
    }

    // Check 5: Get by ID
    try {
      if (stored.length > 0) {
        const firstMemory = await memoryService.getById(stored[0].id);
        results.checks.getById = !!firstMemory;
        results.retrievedMemory = firstMemory
          ? { id: firstMemory.id, content: firstMemory.content }
          : null;
      }
    } catch (error) {
      results.checks.getById = false;
      results.errors.push(`Get by ID failed: ${error}`);
    }

    // Check 6: Get stats
    try {
      const stats = await memoryService.getStats(testUserId);
      results.checks.getStats = stats.total > 0;
      results.stats = stats;
    } catch (error) {
      results.checks.getStats = false;
      results.errors.push(`Get stats failed: ${error}`);
    }

    // Check 7: Hybrid search (if graph enabled)
    try {
      const hybridResults = await memoryService.hybridSearch(
        testUserId,
        'React TypeScript',
        {
          limit: 5,
          threshold: 0.5,
          includeGraph: true,
        }
      );

      results.checks.hybridSearch = true;
      results.hybridResults = {
        vectorResults: hybridResults.metadata?.vectorResults || 0,
        graphResults: hybridResults.metadata?.graphResults || 0,
        combinedResults: hybridResults.metadata?.combinedResults || 0,
      };
    } catch (error) {
      results.checks.hybridSearch = false;
      results.errors.push(`Hybrid search failed: ${error}`);
    }

    // Overall status
    const allChecks = Object.values(results.checks);
    const passedChecks = allChecks.filter((check) => check === true).length;
    const totalChecks = allChecks.length;

    results.status =
      passedChecks === totalChecks
        ? 'success'
        : passedChecks > totalChecks / 2
          ? 'partial'
          : 'error';

    results.summary = {
      passed: passedChecks,
      total: totalChecks,
      percentage: Math.round((passedChecks / totalChecks) * 100),
    };

    return NextResponse.json(results, {
      status: results.status === 'success' ? 200 : 500,
    });
  } catch (error) {
    results.status = 'error';
    results.errors.push(`Unexpected error: ${error}`);
    return NextResponse.json(results, { status: 500 });
  }
}

/**
 * DELETE /api/memory/test
 * Clean up test data
 */
export async function DELETE() {
  // Block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Test endpoint not available in production' },
      { status: 403 }
    );
  }

  try {
    const testUserId = 'test-user-memory';

    // Get all test memories
    const memories = await memoryService.getAll(testUserId);

    // Delete them
    for (const memory of memories) {
      await memoryService.delete(memory.id, true); // Hard delete
    }

    return NextResponse.json({
      status: 'success',
      message: `Deleted ${memories.length} test memories`,
      deletedCount: memories.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Cleanup failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
