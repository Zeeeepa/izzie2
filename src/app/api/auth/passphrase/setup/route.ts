/**
 * Passphrase Setup API
 *
 * POST /api/auth/passphrase/setup
 * Sets up encryption for a user account with a new passphrase
 *
 * GET /api/auth/passphrase/setup
 * Generates a suggested passphrase for the user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  generatePassphrase,
  generateSalt,
  deriveKey,
  validatePassphrase,
} from '@/lib/encryption';

const LOG_PREFIX = '[Passphrase Setup]';

/**
 * GET /api/auth/passphrase/setup
 * Generate a suggested passphrase for the user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Check if user already has encryption enabled
    const db = dbClient.getDb();
    const [user] = await db
      .select({
        encryptionEnabled: users.encryptionEnabled,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user?.encryptionEnabled) {
      return NextResponse.json(
        { error: 'Encryption is already enabled for this account' },
        { status: 400 }
      );
    }

    // Generate a suggested passphrase
    const suggestedPassphrase = generatePassphrase();

    console.log(`${LOG_PREFIX} Generated passphrase suggestion for user: ${userId}`);

    return NextResponse.json({
      suggestedPassphrase,
      instructions: [
        'Write down this passphrase and store it in a safe place.',
        'You will need to enter this passphrase every time you log in.',
        'If you lose this passphrase, you will NOT be able to recover your encrypted data.',
        'You can also create your own passphrase (minimum 8 characters, 30+ bits of entropy).',
      ],
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
 * POST /api/auth/passphrase/setup
 * Set up encryption with the provided passphrase
 *
 * Body:
 * - passphrase: string - The user's chosen passphrase
 * - confirmPassphrase: string - Confirmation of the passphrase
 * - hint: string (optional) - A hint to help remember the passphrase
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const { passphrase, confirmPassphrase, hint } = body as {
      passphrase: string;
      confirmPassphrase: string;
      hint?: string;
    };

    // Validate inputs
    if (!passphrase || !confirmPassphrase) {
      return NextResponse.json(
        { error: 'Passphrase and confirmation are required' },
        { status: 400 }
      );
    }

    if (passphrase !== confirmPassphrase) {
      return NextResponse.json(
        { error: 'Passphrases do not match' },
        { status: 400 }
      );
    }

    // Validate passphrase strength
    const validation = validatePassphrase(passphrase);
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

    // Check if user already has encryption enabled
    const [existingUser] = await db
      .select({
        encryptionEnabled: users.encryptionEnabled,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (existingUser?.encryptionEnabled) {
      return NextResponse.json(
        { error: 'Encryption is already enabled. Use /change to update your passphrase.' },
        { status: 400 }
      );
    }

    // Generate a unique salt for this user
    const salt = generateSalt();

    // Derive the encryption key
    const { hash } = await deriveKey(passphrase, salt);

    // Update user record with encryption settings
    await db
      .update(users)
      .set({
        encryptionEnabled: true,
        encryptionSalt: salt,
        encryptionKeyHash: hash,
        passphraseHint: hint || null,
        encryptionFailedAttempts: 0,
        encryptionLockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    console.log(`${LOG_PREFIX} Encryption enabled for user: ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Encryption has been enabled for your account.',
      warning: 'Please save your passphrase securely. If you lose it, your encrypted data cannot be recovered.',
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
