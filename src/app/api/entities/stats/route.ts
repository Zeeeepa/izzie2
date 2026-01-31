/**
 * Entity Stats API Route
 * GET /api/entities/stats - Get entity counts by type
 *
 * Uses Weaviate aggregate for true counts.
 * Cached with 5-minute TTL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getWeaviateClient } from '@/lib/weaviate/client';
import { COLLECTIONS } from '@/lib/weaviate/schema';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Entities Stats API]';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Simple in-memory cache
let cachedStats: Record<EntityType, number> | null = null;
let cacheTimestamp = 0;

/**
 * Get entity stats using Weaviate aggregate (true counts)
 */
async function getEntityStatsFromWeaviate(): Promise<Record<EntityType, number>> {
  const client = await getWeaviateClient();

  const stats: Record<EntityType, number> = {
    person: 0,
    company: 0,
    project: 0,
    topic: 0,
    location: 0,
    action_item: 0,
  };

  for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
    try {
      const collection = client.collections.get(collectionName);
      const result = await collection.aggregate.overAll();
      stats[entityType as EntityType] = result.totalCount || 0;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to get count for '${collectionName}':`, error);
    }
  }

  return stats;
}

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    await requireAuth(request);

    const now = Date.now();

    // Check cache validity
    if (cachedStats && now - cacheTimestamp < CACHE_TTL_MS) {
      console.log(`${LOG_PREFIX} Returning cached stats (age: ${Math.round((now - cacheTimestamp) / 1000)}s)`);
      return NextResponse.json({
        stats: cachedStats,
        total: Object.values(cachedStats).reduce((sum, count) => sum + count, 0),
        cached: true,
        cacheAge: Math.round((now - cacheTimestamp) / 1000),
      });
    }

    // Fetch fresh stats from Weaviate
    console.log(`${LOG_PREFIX} Fetching fresh stats from Weaviate...`);
    const stats = await getEntityStatsFromWeaviate();

    // Update cache
    cachedStats = stats;
    cacheTimestamp = now;

    const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
    console.log(`${LOG_PREFIX} Stats:`, stats, `Total: ${total}`);

    return NextResponse.json({
      stats,
      total,
      cached: false,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to fetch entity stats:`, error);
    return NextResponse.json(
      {
        error: 'Failed to fetch entity stats',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
