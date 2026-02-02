/**
 * LLM Costs API
 * GET /api/settings/costs - Returns LLM usage costs for the authenticated user
 *
 * Response includes:
 * - Today's total cost
 * - All-time total cost
 * - Breakdown by operation type
 * - Daily costs for the last 30 days
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db/client';
import { llmUsage } from '@/lib/db/schema';
import { eq, sql, gte, and, desc } from 'drizzle-orm';

const LOG_PREFIX = '[Settings Costs API]';

interface CostsByOperationType {
  operationType: string;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  requestCount: number;
}

interface DailyCost {
  date: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

interface CostsResponse {
  today: {
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
  };
  allTime: {
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
  };
  byOperationType: CostsByOperationType[];
  dailyCosts: DailyCost[];
}

/**
 * GET /api/settings/costs
 * Returns LLM usage costs for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const db = dbClient.getDb();

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Get 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Query 1: Today's totals
    const todayResult = await db
      .select({
        totalCost: sql<number>`COALESCE(SUM(${llmUsage.costUsd}), 0)::real`,
        inputTokens: sql<number>`COALESCE(SUM(${llmUsage.inputTokens}), 0)::integer`,
        outputTokens: sql<number>`COALESCE(SUM(${llmUsage.outputTokens}), 0)::integer`,
        requestCount: sql<number>`COUNT(*)::integer`,
      })
      .from(llmUsage)
      .where(
        and(
          eq(llmUsage.userId, userId),
          gte(llmUsage.createdAt, todayStart)
        )
      );

    // Query 2: All-time totals
    const allTimeResult = await db
      .select({
        totalCost: sql<number>`COALESCE(SUM(${llmUsage.costUsd}), 0)::real`,
        inputTokens: sql<number>`COALESCE(SUM(${llmUsage.inputTokens}), 0)::integer`,
        outputTokens: sql<number>`COALESCE(SUM(${llmUsage.outputTokens}), 0)::integer`,
        requestCount: sql<number>`COUNT(*)::integer`,
      })
      .from(llmUsage)
      .where(eq(llmUsage.userId, userId));

    // Query 3: Breakdown by operation type
    const byOperationTypeResult = await db
      .select({
        operationType: llmUsage.operationType,
        totalCost: sql<number>`COALESCE(SUM(${llmUsage.costUsd}), 0)::real`,
        totalInputTokens: sql<number>`COALESCE(SUM(${llmUsage.inputTokens}), 0)::integer`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${llmUsage.outputTokens}), 0)::integer`,
        requestCount: sql<number>`COUNT(*)::integer`,
      })
      .from(llmUsage)
      .where(eq(llmUsage.userId, userId))
      .groupBy(llmUsage.operationType)
      .orderBy(desc(sql`SUM(${llmUsage.costUsd})`));

    // Query 4: Daily costs for last 30 days
    const dailyCostsResult = await db
      .select({
        date: sql<string>`DATE(${llmUsage.createdAt})::text`,
        cost: sql<number>`COALESCE(SUM(${llmUsage.costUsd}), 0)::real`,
        inputTokens: sql<number>`COALESCE(SUM(${llmUsage.inputTokens}), 0)::integer`,
        outputTokens: sql<number>`COALESCE(SUM(${llmUsage.outputTokens}), 0)::integer`,
        requestCount: sql<number>`COUNT(*)::integer`,
      })
      .from(llmUsage)
      .where(
        and(
          eq(llmUsage.userId, userId),
          gte(llmUsage.createdAt, thirtyDaysAgo)
        )
      )
      .groupBy(sql`DATE(${llmUsage.createdAt})`)
      .orderBy(desc(sql`DATE(${llmUsage.createdAt})`));

    const response: CostsResponse = {
      today: {
        totalCost: todayResult[0]?.totalCost || 0,
        inputTokens: todayResult[0]?.inputTokens || 0,
        outputTokens: todayResult[0]?.outputTokens || 0,
        requestCount: todayResult[0]?.requestCount || 0,
      },
      allTime: {
        totalCost: allTimeResult[0]?.totalCost || 0,
        inputTokens: allTimeResult[0]?.inputTokens || 0,
        outputTokens: allTimeResult[0]?.outputTokens || 0,
        requestCount: allTimeResult[0]?.requestCount || 0,
      },
      byOperationType: byOperationTypeResult.map((row) => ({
        operationType: row.operationType,
        totalCost: row.totalCost,
        totalInputTokens: row.totalInputTokens,
        totalOutputTokens: row.totalOutputTokens,
        requestCount: row.requestCount,
      })),
      dailyCosts: dailyCostsResult.map((row) => ({
        date: row.date,
        cost: row.cost,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        requestCount: row.requestCount,
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error(`${LOG_PREFIX} GET error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
