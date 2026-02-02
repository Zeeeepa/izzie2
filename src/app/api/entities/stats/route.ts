/**
 * Entity Stats API Route
 * GET /api/entities/stats - Get entity counts by type for the current user
 *
 * Uses Weaviate aggregate with tenant isolation for true counts.
 * Cached with 5-minute TTL per user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getWeaviateClient, ensureTenant } from '@/lib/weaviate/client';
import { COLLECTIONS } from '@/lib/weaviate/schema';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Entities Stats API]';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Per-user cache: Map<userId, { stats, timestamp }>
const userStatsCache = new Map<string, { stats: Record<EntityType, number>; timestamp: number }>();

/**
 * Get entity stats using Weaviate aggregate (true counts) with tenant isolation
 */
async function getEntityStatsFromWeaviate(userId: string): Promise<Record<EntityType, number>> {
  const client = await getWeaviateClient();

  const stats: Record<EntityType, number> = {
    person: 0,
    company: 0,
    project: 0,
    tool: 0,
    topic: 0,
    location: 0,
    action_item: 0,
  };

  for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
    try {
      // Ensure tenant exists for this user
      await ensureTenant(collectionName, userId);

      const collection = client.collections.get(collectionName);
      // Use tenant-specific collection for accurate per-user counts
      const tenantCollection = collection.withTenant(userId);
      const result = await tenantCollection.aggregate.overAll();
      stats[entityType as EntityType] = result.totalCount || 0;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to get count for '${collectionName}':`, error);
    }
  }

  return stats;
}

export async function GET(request: NextRequest) {
  try {
    // Require authentication and get user ID for tenant isolation
    const session = await requireAuth(request);
    const userId = session.user.id;

    const now = Date.now();

    // Check per-user cache validity
    const cachedEntry = userStatsCache.get(userId);
    if (cachedEntry && now - cachedEntry.timestamp < CACHE_TTL_MS) {
      console.log(`${LOG_PREFIX} Returning cached stats for user ${userId} (age: ${Math.round((now - cachedEntry.timestamp) / 1000)}s)`);
      return NextResponse.json({
        stats: cachedEntry.stats,
        total: Object.values(cachedEntry.stats).reduce((sum, count) => sum + count, 0),
        cached: true,
        cacheAge: Math.round((now - cachedEntry.timestamp) / 1000),
      });
    }

    // Fetch fresh stats from Weaviate with tenant isolation
    console.log(`${LOG_PREFIX} Fetching fresh stats from Weaviate for user ${userId}...`);
    const stats = await getEntityStatsFromWeaviate(userId);

    // Update per-user cache
    userStatsCache.set(userId, { stats, timestamp: now });

    const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
    console.log(`${LOG_PREFIX} Stats for user ${userId}:`, stats, `Total: ${total}`);

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
