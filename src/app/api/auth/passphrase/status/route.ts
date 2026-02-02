/**
 * Encryption Status API
 *
 * GET /api/auth/passphrase/status
 * Returns the user's encryption status and settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const LOG_PREFIX = '[Encryption Status]';

/**
 * GET /api/auth/passphrase/status
 * Get encryption status for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const db = dbClient.getDb();
    const [user] = await db
      .select({
        encryptionEnabled: users.encryptionEnabled,
        passphraseHint: users.passphraseHint,
        encryptionLockedUntil: users.encryptionLockedUntil,
        encryptionFailedAttempts: users.encryptionFailedAttempts,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if account is locked
    const isLocked =
      user.encryptionLockedUntil &&
      new Date(user.encryptionLockedUntil) > new Date();

    return NextResponse.json({
      encryptionEnabled: user.encryptionEnabled,
      hasHint: !!user.passphraseHint,
      hint: user.passphraseHint,
      isLocked,
      lockedUntil: isLocked ? user.encryptionLockedUntil : null,
      failedAttempts: user.encryptionFailedAttempts,
      lastUpdated: user.updatedAt,
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
