/**
 * Entity Aliases API Route
 * GET /api/entities/aliases - Get aliases for an entity
 *
 * Query params:
 *  - entityType: The entity type (person, company, etc.)
 *  - entityValue: The canonical entity value
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { entityAliases } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const LOG_PREFIX = '[Entity Aliases API]';

/**
 * GET /api/entities/aliases
 * Get aliases for a specific entity
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType');
    const entityValue = searchParams.get('entityValue');

    if (!entityType || !entityValue) {
      return NextResponse.json(
        { error: 'entityType and entityValue are required' },
        { status: 400 }
      );
    }

    console.log(
      `${LOG_PREFIX} Fetching aliases for ${entityType}:${entityValue} (user: ${userId})`
    );

    const db = dbClient.getDb();

    // Fetch aliases where this entity is the canonical value
    const aliasRecords = await db
      .select()
      .from(entityAliases)
      .where(
        and(
          eq(entityAliases.userId, userId),
          eq(entityAliases.entityType, entityType),
          eq(entityAliases.entityValue, entityValue)
        )
      );

    const aliases = aliasRecords.map((record) => record.alias);

    // Also check if this entity is itself an alias for another entity
    const reverseAliases = await db
      .select()
      .from(entityAliases)
      .where(
        and(
          eq(entityAliases.userId, userId),
          eq(entityAliases.entityType, entityType),
          eq(entityAliases.alias, entityValue)
        )
      );

    // If this entity is an alias, include the canonical value in the list
    const canonicalValues = reverseAliases.map((record) => record.entityValue);

    return NextResponse.json({
      entityType,
      entityValue,
      aliases,
      isAliasOf: canonicalValues.length > 0 ? canonicalValues : null,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching aliases:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch aliases',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
