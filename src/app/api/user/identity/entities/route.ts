/**
 * Identity Entities API
 * GET /api/user/identity/entities - List all identity entities
 * POST /api/user/identity/entities - Link an entity to identity
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { userIdentity, identityEntities, users, IDENTITY_ENTITY_TYPE } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const LOG_PREFIX = '[Identity Entities API]';

const VALID_ENTITY_TYPES = Object.values(IDENTITY_ENTITY_TYPE);

/**
 * GET /api/user/identity/entities
 * List all entities linked to user's identity
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const db = dbClient.getDb();

    // Get user's identity
    const [identity] = await db
      .select()
      .from(userIdentity)
      .where(eq(userIdentity.userId, userId))
      .limit(1);

    if (!identity) {
      return NextResponse.json({
        entities: [],
        total: 0,
      });
    }

    // Get all linked entities
    const entities = await db
      .select()
      .from(identityEntities)
      .where(eq(identityEntities.identityId, identity.id))
      .orderBy(identityEntities.entityType, identityEntities.createdAt);

    return NextResponse.json({
      entities: entities.map((e) => ({
        id: e.id,
        entityType: e.entityType,
        entityValue: e.entityValue,
        isPrimary: e.isPrimary,
        createdAt: e.createdAt,
      })),
      total: entities.length,
    });
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

/**
 * POST /api/user/identity/entities
 * Link an entity to user's identity
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const { entityType, entityValue, isPrimary = false } = body;

    // Validate entityType
    if (!entityType || typeof entityType !== 'string') {
      return NextResponse.json(
        { error: 'entityType is required' },
        { status: 400 }
      );
    }

    if (!VALID_ENTITY_TYPES.includes(entityType as any)) {
      return NextResponse.json(
        { error: `Invalid entityType. Valid options: ${VALID_ENTITY_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate entityValue
    if (!entityValue || typeof entityValue !== 'string') {
      return NextResponse.json(
        { error: 'entityValue is required' },
        { status: 400 }
      );
    }

    if (entityValue.trim().length === 0) {
      return NextResponse.json(
        { error: 'entityValue cannot be empty' },
        { status: 400 }
      );
    }

    if (entityValue.length > 500) {
      return NextResponse.json(
        { error: 'entityValue must be 500 characters or less' },
        { status: 400 }
      );
    }

    // Normalize email values
    const normalizedValue =
      entityType === 'email' ? entityValue.toLowerCase().trim() : entityValue.trim();

    const db = dbClient.getDb();

    // Get or create user identity
    let [identity] = await db
      .select()
      .from(userIdentity)
      .where(eq(userIdentity.userId, userId))
      .limit(1);

    if (!identity) {
      // Create identity if it doesn't exist
      const [user] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const [newIdentity] = await db
        .insert(userIdentity)
        .values({
          userId,
          displayName: user?.name || null,
        })
        .returning();

      identity = newIdentity;
      console.log(`${LOG_PREFIX} Created identity for user:`, userId);
    }

    // Check if entity already exists
    const [existing] = await db
      .select()
      .from(identityEntities)
      .where(
        and(
          eq(identityEntities.userId, userId),
          eq(identityEntities.entityType, entityType),
          eq(identityEntities.entityValue, normalizedValue)
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: 'This entity is already linked to your identity' },
        { status: 409 }
      );
    }

    // If this is marked as primary, unset other primaries of same type
    if (isPrimary) {
      await db
        .update(identityEntities)
        .set({ isPrimary: false })
        .where(
          and(
            eq(identityEntities.userId, userId),
            eq(identityEntities.entityType, entityType)
          )
        );
    }

    // Insert the new entity
    const [newEntity] = await db
      .insert(identityEntities)
      .values({
        userId,
        identityId: identity.id,
        entityType,
        entityValue: normalizedValue,
        isPrimary,
      })
      .returning();

    console.log(`${LOG_PREFIX} Added entity for user:`, userId, entityType, normalizedValue);

    return NextResponse.json({
      success: true,
      entity: {
        id: newEntity.id,
        entityType: newEntity.entityType,
        entityValue: newEntity.entityValue,
        isPrimary: newEntity.isPrimary,
        createdAt: newEntity.createdAt,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} POST error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'This entity is already linked to your identity' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
