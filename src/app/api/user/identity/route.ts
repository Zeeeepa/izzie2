/**
 * User Identity API
 * GET /api/user/identity - Get user's identity and linked entities
 * PUT /api/user/identity - Update display name
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { userIdentity, identityEntities, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const LOG_PREFIX = '[User Identity API]';

/**
 * GET /api/user/identity
 * Get user's identity and all linked entities
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const db = dbClient.getDb();

    // Get or create user identity
    let [identity] = await db
      .select()
      .from(userIdentity)
      .where(eq(userIdentity.userId, userId))
      .limit(1);

    // If no identity exists, create one with the user's name as display name
    if (!identity) {
      const [user] = await db
        .select({ name: users.name, email: users.email })
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

      // Auto-populate with user's email from account
      if (user?.email) {
        await db.insert(identityEntities).values({
          userId,
          identityId: identity.id,
          entityType: 'email',
          entityValue: user.email.toLowerCase(),
          isPrimary: true,
        });
      }

      console.log(`${LOG_PREFIX} Created identity for user:`, userId);
    }

    // Get all linked entities
    const entities = await db
      .select()
      .from(identityEntities)
      .where(eq(identityEntities.identityId, identity.id))
      .orderBy(identityEntities.entityType, identityEntities.createdAt);

    return NextResponse.json({
      identity: {
        id: identity.id,
        userId: identity.userId,
        displayName: identity.displayName,
        createdAt: identity.createdAt,
        updatedAt: identity.updatedAt,
      },
      entities: entities.map((e) => ({
        id: e.id,
        entityType: e.entityType,
        entityValue: e.entityValue,
        isPrimary: e.isPrimary,
        createdAt: e.createdAt,
      })),
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
 * PUT /api/user/identity
 * Update user's identity (display name)
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const { displayName } = body;

    // Validate displayName
    if (displayName !== null && displayName !== undefined) {
      if (typeof displayName !== 'string') {
        return NextResponse.json(
          { error: 'displayName must be a string or null' },
          { status: 400 }
        );
      }
      if (displayName.length > 255) {
        return NextResponse.json(
          { error: 'displayName must be 255 characters or less' },
          { status: 400 }
        );
      }
    }

    const db = dbClient.getDb();

    // Get or create user identity
    let [identity] = await db
      .select()
      .from(userIdentity)
      .where(eq(userIdentity.userId, userId))
      .limit(1);

    if (!identity) {
      // Create identity if it doesn't exist
      const [newIdentity] = await db
        .insert(userIdentity)
        .values({
          userId,
          displayName: displayName?.trim() || null,
        })
        .returning();

      identity = newIdentity;
      console.log(`${LOG_PREFIX} Created identity with display name for user:`, userId);
    } else {
      // Update existing identity
      await db
        .update(userIdentity)
        .set({
          displayName: displayName?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(userIdentity.userId, userId));

      console.log(`${LOG_PREFIX} Updated display name for user:`, userId);
    }

    // Re-fetch to return updated data
    const [updatedIdentity] = await db
      .select()
      .from(userIdentity)
      .where(eq(userIdentity.userId, userId))
      .limit(1);

    return NextResponse.json({
      success: true,
      identity: {
        id: updatedIdentity.id,
        userId: updatedIdentity.userId,
        displayName: updatedIdentity.displayName,
        createdAt: updatedIdentity.createdAt,
        updatedAt: updatedIdentity.updatedAt,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} PUT error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
