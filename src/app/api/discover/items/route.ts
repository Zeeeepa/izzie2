/**
 * GET /api/discover/items
 * Get all discovered items with pagination
 * Query params: page, limit, type (entity|relationship), status (pending|reviewed|skipped)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import { getActiveAutonomousSession } from '@/lib/training/autonomous-training';
import { dbClient } from '@/lib/db';
import { trainingSamples } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuthWithTestBypass(request);

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const type = searchParams.get('type') as 'entity' | 'relationship' | null;
    const status = searchParams.get('status') as 'pending' | 'reviewed' | 'skipped' | null;

    // Get active discovery session
    const session = await getActiveAutonomousSession(userId);

    if (!session) {
      return NextResponse.json({
        success: true,
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      });
    }

    const db = dbClient.getDb();
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [eq(trainingSamples.sessionId, session.id)];
    if (type) {
      conditions.push(eq(trainingSamples.type, type));
    }
    if (status) {
      conditions.push(eq(trainingSamples.status, status));
    }

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(trainingSamples)
      .where(and(...conditions));
    const total = Number(countResult?.count) || 0;

    // Get items
    const items = await db
      .select({
        id: trainingSamples.id,
        type: trainingSamples.type,
        contentText: trainingSamples.contentText,
        contentContext: trainingSamples.contentContext,
        sourceId: trainingSamples.sourceId,
        sourceType: trainingSamples.sourceType,
        predictionLabel: trainingSamples.predictionLabel,
        predictionConfidence: trainingSamples.predictionConfidence,
        predictionReasoning: trainingSamples.predictionReasoning,
        status: trainingSamples.status,
        feedbackIsCorrect: trainingSamples.feedbackIsCorrect,
        feedbackCorrectedLabel: trainingSamples.feedbackCorrectedLabel,
        feedbackNotes: trainingSamples.feedbackNotes,
        createdAt: trainingSamples.createdAt,
      })
      .from(trainingSamples)
      .where(and(...conditions))
      .orderBy(desc(trainingSamples.createdAt))
      .limit(limit)
      .offset(offset);

    // Transform items for UI
    const transformedItems = items.map((item) => ({
      id: item.id,
      type: item.type as 'entity' | 'relationship',
      content: {
        text: item.contentText,
        context: item.contentContext || undefined,
      },
      source: {
        id: item.sourceId || undefined,
        type: item.sourceType || undefined,
      },
      prediction: {
        label: item.predictionLabel,
        confidence: item.predictionConfidence,
        reasoning: item.predictionReasoning || undefined,
      },
      status: item.status as 'pending' | 'reviewed' | 'skipped',
      feedback: item.feedbackIsCorrect !== null
        ? {
            isCorrect: item.feedbackIsCorrect,
            correctedLabel: item.feedbackCorrectedLabel || undefined,
            notes: item.feedbackNotes || undefined,
          }
        : undefined,
      createdAt: item.createdAt,
    }));

    return NextResponse.json({
      success: true,
      items: transformedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      sessionId: session.id,
    });
  } catch (error) {
    console.error('[Discover Items] Error:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get discovered items',
      },
      { status: 500 }
    );
  }
}
