/**
 * Passphrase Verification API
 *
 * POST /api/auth/passphrase/verify
 * Verifies user's passphrase after OAuth login
 *
 * GET /api/auth/passphrase/verify
 * Checks if user needs to verify passphrase (encryption enabled status)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassphrase, deriveKey } from '@/lib/encryption';

const LOG_PREFIX = '[Passphrase Verify]';

// Lock duration after max failed attempts (15 minutes)
const LOCK_DURATION_MS = 15 * 60 * 1000;
// Maximum failed attempts before account lock
const MAX_FAILED_ATTEMPTS = 3;

/**
 * GET /api/auth/passphrase/verify
 * Check if user needs to verify passphrase
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
      requiresVerification: user.encryptionEnabled,
      hint: user.passphraseHint,
      isLocked,
      lockedUntil: isLocked ? user.encryptionLockedUntil : null,
      failedAttempts: user.encryptionFailedAttempts,
      maxAttempts: MAX_FAILED_ATTEMPTS,
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
 * POST /api/auth/passphrase/verify
 * Verify the user's passphrase
 *
 * Body:
 * - passphrase: string - The user's passphrase
 *
 * Returns:
 * - success: boolean
 * - derivedKey: string (base64) - Only returned on success, for client to store in session
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const { passphrase } = body as { passphrase: string };

    if (!passphrase) {
      return NextResponse.json(
        { error: 'Passphrase is required' },
        { status: 400 }
      );
    }

    const db = dbClient.getDb();
    const [user] = await db
      .select({
        encryptionEnabled: users.encryptionEnabled,
        encryptionSalt: users.encryptionSalt,
        encryptionKeyHash: users.encryptionKeyHash,
        encryptionLockedUntil: users.encryptionLockedUntil,
        encryptionFailedAttempts: users.encryptionFailedAttempts,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.encryptionEnabled) {
      return NextResponse.json(
        { error: 'Encryption is not enabled for this account' },
        { status: 400 }
      );
    }

    // Check if account is locked
    if (
      user.encryptionLockedUntil &&
      new Date(user.encryptionLockedUntil) > new Date()
    ) {
      const remainingMs =
        new Date(user.encryptionLockedUntil).getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60000);

      return NextResponse.json(
        {
          error: `Account is locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.`,
          lockedUntil: user.encryptionLockedUntil,
          isLocked: true,
        },
        { status: 423 } // Locked
      );
    }

    // Verify the passphrase
    if (!user.encryptionKeyHash || !user.encryptionSalt) {
      return NextResponse.json(
        { error: 'Encryption configuration is invalid' },
        { status: 500 }
      );
    }

    const isValid = await verifyPassphrase(passphrase, user.encryptionKeyHash);

    if (!isValid) {
      // Increment failed attempts
      const newFailedAttempts = (user.encryptionFailedAttempts || 0) + 1;
      const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

      await db
        .update(users)
        .set({
          encryptionFailedAttempts: newFailedAttempts,
          encryptionLockedUntil: shouldLock
            ? new Date(Date.now() + LOCK_DURATION_MS)
            : null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      console.warn(
        `${LOG_PREFIX} Failed passphrase attempt ${newFailedAttempts}/${MAX_FAILED_ATTEMPTS} for user: ${userId}`
      );

      if (shouldLock) {
        return NextResponse.json(
          {
            error: 'Too many failed attempts. Account has been locked for 15 minutes.',
            isLocked: true,
            lockedUntil: new Date(Date.now() + LOCK_DURATION_MS),
          },
          { status: 423 }
        );
      }

      return NextResponse.json(
        {
          error: 'Invalid passphrase',
          failedAttempts: newFailedAttempts,
          maxAttempts: MAX_FAILED_ATTEMPTS,
          remainingAttempts: MAX_FAILED_ATTEMPTS - newFailedAttempts,
        },
        { status: 401 }
      );
    }

    // Success - reset failed attempts
    await db
      .update(users)
      .set({
        encryptionFailedAttempts: 0,
        encryptionLockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Derive the key for the session
    const { key } = await deriveKey(passphrase, user.encryptionSalt);

    console.log(`${LOG_PREFIX} Passphrase verified for user: ${userId}`);

    // Return the derived key (base64 encoded) for client-side session storage
    // The key is stored only in memory (session storage) and never persisted
    return NextResponse.json({
      success: true,
      // The derived key is returned to be stored in session memory
      // This allows encryption/decryption operations without re-entering passphrase
      encryptionKey: key.toString('base64'),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} POST error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
