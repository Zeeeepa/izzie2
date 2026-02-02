/**
 * Identity Entity by ID API
 * DELETE /api/user/identity/entities/[id] - Unlink an entity from identity
 * PATCH /api/user/identity/entities/[id] - Update entity (set as primary)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { identityEntities } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const LOG_PREFIX = '[Identity Entity API]';

/**
 * DELETE /api/user/identity/entities/[id]
 * Unlink an entity from user's identity
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { id: entityId } = await params;

    if (!entityId) {
      return NextResponse.json(
        { error: 'Entity ID is required' },
        { status: 400 }
      );
    }

    const db = dbClient.getDb();

    // Find the entity and verify ownership
    const [entity] = await db
      .select()
      .from(identityEntities)
      .where(
        and(
          eq(identityEntities.id, entityId),
          eq(identityEntities.userId, userId)
        )
      )
      .limit(1);

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or you do not have permission to delete it' },
        { status: 404 }
      );
    }

    // Delete the entity
    await db
      .delete(identityEntities)
      .where(eq(identityEntities.id, entityId));

    console.log(`${LOG_PREFIX} Deleted entity for user:`, userId, entity.entityType, entity.entityValue);

    return NextResponse.json({
      success: true,
      deleted: {
        id: entity.id,
        entityType: entity.entityType,
        entityValue: entity.entityValue,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} DELETE error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user/identity/entities/[id]
 * Update entity properties (e.g., set as primary)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { id: entityId } = await params;

    if (!entityId) {
      return NextResponse.json(
        { error: 'Entity ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { isPrimary } = body;

    if (typeof isPrimary !== 'boolean') {
      return NextResponse.json(
        { error: 'isPrimary must be a boolean' },
        { status: 400 }
      );
    }

    const db = dbClient.getDb();

    // Find the entity and verify ownership
    const [entity] = await db
      .select()
      .from(identityEntities)
      .where(
        and(
          eq(identityEntities.id, entityId),
          eq(identityEntities.userId, userId)
        )
      )
      .limit(1);

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or you do not have permission to update it' },
        { status: 404 }
      );
    }

    // If setting as primary, unset other primaries of same type
    if (isPrimary) {
      await db
        .update(identityEntities)
        .set({ isPrimary: false })
        .where(
          and(
            eq(identityEntities.userId, userId),
            eq(identityEntities.entityType, entity.entityType)
          )
        );
    }

    // Update the entity
    const [updatedEntity] = await db
      .update(identityEntities)
      .set({ isPrimary })
      .where(eq(identityEntities.id, entityId))
      .returning();

    console.log(`${LOG_PREFIX} Updated entity for user:`, userId, entity.entityType, 'isPrimary:', isPrimary);

    return NextResponse.json({
      success: true,
      entity: {
        id: updatedEntity.id,
        entityType: updatedEntity.entityType,
        entityValue: updatedEntity.entityValue,
        isPrimary: updatedEntity.isPrimary,
        createdAt: updatedEntity.createdAt,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} PATCH error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
