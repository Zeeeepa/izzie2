/**
 * GET /api/discover/items
 * Get all discovered items with pagination and deduplication
 * Query params: page, limit, type (entity|relationship), status (pending|reviewed|skipped)
 *
 * Deduplication: Items are grouped by (contentText, predictionLabel) combination.
 * The most recent instance (by createdAt) is returned with an occurrenceCount field.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import { getActiveAutonomousSession } from '@/lib/training/autonomous-training';
import { dbClient } from '@/lib/db';
import { trainingSamples } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

// Type for the raw query result
interface RawItemRow {
  id: string;
  type: string;
  content_text: string;
  content_context: string | null;
  source_id: string | null;
  source_type: string | null;
  prediction_label: string;
  prediction_confidence: number;
  prediction_reasoning: string | null;
  status: string;
  feedback_is_correct: boolean | null;
  feedback_corrected_label: string | null;
  feedback_notes: string | null;
  created_at: string;
  occurrence_count: number | string;
}

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

    // Build conditions for Drizzle ORM query
    const conditions = [eq(trainingSamples.sessionId, session.id)];
    if (type) {
      conditions.push(eq(trainingSamples.type, type));
    }
    // If status filter is provided, use it; otherwise default to 'pending' only
    // This ensures reviewed/skipped items don't appear in the discovery list by default
    if (status) {
      conditions.push(eq(trainingSamples.status, status));
    } else {
      conditions.push(eq(trainingSamples.status, 'pending'));
    }

    // First, get all items matching the conditions (we'll deduplicate in memory)
    // This is simpler and more type-safe than raw SQL
    const allItems = await db
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
        isIdentity: trainingSamples.isIdentity,
      })
      .from(trainingSamples)
      .where(and(...conditions))
      .orderBy(desc(trainingSamples.createdAt));

    // Deduplicate by (contentText, predictionLabel) combination
    // Keep the most recent instance and count occurrences
    const deduplicationMap = new Map<string, {
      item: typeof allItems[0];
      count: number;
    }>();

    for (const item of allItems) {
      const key = `${item.contentText}||${item.predictionLabel}`;
      const existing = deduplicationMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        deduplicationMap.set(key, { item, count: 1 });
      }
    }

    // Convert to array and apply pagination
    const uniqueItems = Array.from(deduplicationMap.values());
    const total = uniqueItems.length;
    const paginatedItems = uniqueItems.slice(offset, offset + limit);

    // Transform items for UI
    const transformedItems = paginatedItems.map(({ item, count }) => ({
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
      occurrenceCount: count,
      isIdentity: item.isIdentity ?? false,
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
