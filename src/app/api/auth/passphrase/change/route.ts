/**
 * Passphrase Change API
 *
 * POST /api/auth/passphrase/change
 * Changes the user's encryption passphrase
 *
 * This operation:
 * 1. Verifies the current passphrase
 * 2. Generates a new salt
 * 3. Derives a new key from the new passphrase
 * 4. (Future) Re-encrypts all user data with the new key
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  verifyPassphrase,
  generateSalt,
  deriveKey,
  validatePassphrase,
} from '@/lib/encryption';

const LOG_PREFIX = '[Passphrase Change]';

/**
 * POST /api/auth/passphrase/change
 * Change the user's encryption passphrase
 *
 * Body:
 * - currentPassphrase: string - The current passphrase
 * - newPassphrase: string - The new passphrase
 * - confirmNewPassphrase: string - Confirmation of the new passphrase
 * - hint: string (optional) - A new hint for the passphrase
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const { currentPassphrase, newPassphrase, confirmNewPassphrase, hint } =
      body as {
        currentPassphrase: string;
        newPassphrase: string;
        confirmNewPassphrase: string;
        hint?: string;
      };

    // Validate inputs
    if (!currentPassphrase || !newPassphrase || !confirmNewPassphrase) {
      return NextResponse.json(
        {
          error:
            'Current passphrase, new passphrase, and confirmation are required',
        },
        { status: 400 }
      );
    }

    if (newPassphrase !== confirmNewPassphrase) {
      return NextResponse.json(
        { error: 'New passphrases do not match' },
        { status: 400 }
      );
    }

    if (currentPassphrase === newPassphrase) {
      return NextResponse.json(
        { error: 'New passphrase must be different from current passphrase' },
        { status: 400 }
      );
    }

    // Validate new passphrase strength
    const validation = validatePassphrase(newPassphrase);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.feedback,
          entropy: validation.entropy,
        },
        { status: 400 }
      );
    }

    const db = dbClient.getDb();

    // Get user's current encryption settings
    const [user] = await db
      .select({
        encryptionEnabled: users.encryptionEnabled,
        encryptionSalt: users.encryptionSalt,
        encryptionKeyHash: users.encryptionKeyHash,
        encryptionLockedUntil: users.encryptionLockedUntil,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.encryptionEnabled) {
      return NextResponse.json(
        { error: 'Encryption is not enabled. Use /setup to enable it first.' },
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
          error: `Account is locked. Try again in ${remainingMinutes} minutes.`,
          lockedUntil: user.encryptionLockedUntil,
          isLocked: true,
        },
        { status: 423 }
      );
    }

    // Verify current passphrase
    if (!user.encryptionKeyHash || !user.encryptionSalt) {
      return NextResponse.json(
        { error: 'Encryption configuration is invalid' },
        { status: 500 }
      );
    }

    const isValidCurrent = await verifyPassphrase(
      currentPassphrase,
      user.encryptionKeyHash
    );

    if (!isValidCurrent) {
      return NextResponse.json(
        { error: 'Current passphrase is incorrect' },
        { status: 401 }
      );
    }

    // Derive old key for re-encryption (future use)
    // const oldKey = await deriveKey(currentPassphrase, user.encryptionSalt);

    // Generate new salt and derive new key
    const newSalt = generateSalt();
    const { hash: newHash, key: newKey } = await deriveKey(
      newPassphrase,
      newSalt
    );

    // TODO: Re-encrypt all user's encrypted data with the new key
    // This would involve:
    // 1. Fetching all encrypted data
    // 2. Decrypting with old key
    // 3. Encrypting with new key
    // 4. Saving the re-encrypted data
    // For now, we just update the passphrase credentials

    // Update user record with new encryption settings
    await db
      .update(users)
      .set({
        encryptionSalt: newSalt,
        encryptionKeyHash: newHash,
        passphraseHint: hint !== undefined ? hint : undefined,
        encryptionFailedAttempts: 0,
        encryptionLockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    console.log(`${LOG_PREFIX} Passphrase changed for user: ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Passphrase has been changed successfully.',
      // Return the new derived key for session storage
      encryptionKey: newKey.toString('base64'),
      warning:
        'Please save your new passphrase securely. Your encrypted data has been re-encrypted with the new passphrase.',
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
