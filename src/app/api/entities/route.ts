/**
 * Entity API Route
 * GET /api/entities - List all extracted entities
 * Query params:
 *  - type: Filter by entity type (person, company, project, action_item, etc.)
 *  - limit: Max results (default: 100)
 *  - offset: Pagination offset (default: 0)
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbClient } from '@/lib/db';
import { memoryEntries } from '@/lib/db/schema';
import { sql, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';

interface EntityData {
  id: string;
  type: string;
  value: string;
  normalized: string;
  confidence: number;
  source: string;
  context?: string;
  assignee?: string;
  deadline?: string;
  priority?: string;
  emailId: string;
  emailContent: string;
  emailSummary?: string;
  createdAt: Date;
}

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Get database instance
    const db = dbClient.getDb();

    // Query memory entries that have entities in metadata
    const query = db
      .select({
        id: memoryEntries.id,
        content: memoryEntries.content,
        summary: memoryEntries.summary,
        metadata: memoryEntries.metadata,
        createdAt: memoryEntries.createdAt,
      })
      .from(memoryEntries)
      .where(sql`${memoryEntries.metadata}->>'entities' IS NOT NULL`)
      .orderBy(desc(memoryEntries.createdAt))
      .limit(limit)
      .offset(offset);

    const results = await query;

    // Extract and flatten entities
    const entities: EntityData[] = [];

    for (const entry of results) {
      const metadata = entry.metadata as any;
      const extractedEntities = metadata?.entities || [];

      for (const entity of extractedEntities) {
        // Filter by type if specified
        if (type && entity.type !== type) {
          continue;
        }

        entities.push({
          id: `${entry.id}-${entity.type}-${entity.normalized}`,
          type: entity.type,
          value: entity.value,
          normalized: entity.normalized,
          confidence: entity.confidence,
          source: entity.source,
          context: entity.context,
          assignee: entity.assignee,
          deadline: entity.deadline,
          priority: entity.priority,
          emailId: entry.id,
          emailContent: entry.content.substring(0, 200) + '...', // Truncate for preview
          emailSummary: entry.summary || undefined,
          createdAt: entry.createdAt,
        });
      }
    }

    // Calculate stats by type
    const stats: Record<string, number> = {};
    entities.forEach((entity) => {
      stats[entity.type] = (stats[entity.type] || 0) + 1;
    });

    return NextResponse.json({
      entities,
      stats,
      total: entities.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Failed to fetch entities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch entities', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
