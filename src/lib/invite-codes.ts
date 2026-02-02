/**
 * Invite Code Utilities
 * Helper functions for managing invite codes
 */

import { dbClient } from '@/lib/db';
import { inviteCodes } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Validates an invite code
 * Returns the code record if valid, null otherwise
 */
export async function validateInviteCode(code: string): Promise<{
  valid: boolean;
  message: string;
  codeId?: string;
}> {
  if (!dbClient.isConfigured()) {
    return { valid: false, message: 'Database not configured' };
  }

  const normalizedCode = code.trim().toUpperCase();
  const db = dbClient.getDb();

  const [inviteCode] = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, normalizedCode))
    .limit(1);

  if (!inviteCode) {
    return { valid: false, message: 'Invalid invite code' };
  }

  if (inviteCode.expiresAt && new Date(inviteCode.expiresAt) < new Date()) {
    return { valid: false, message: 'This invite code has expired' };
  }

  if (inviteCode.useCount >= inviteCode.maxUses) {
    return { valid: false, message: 'This invite code has already been used' };
  }

  return { valid: true, message: 'Valid', codeId: inviteCode.id };
}

/**
 * Marks an invite code as used by incrementing use_count
 * Should be called after successful user creation
 */
export async function markInviteCodeUsed(
  code: string,
  userId: string
): Promise<boolean> {
  if (!dbClient.isConfigured()) {
    console.warn('[InviteCode] Database not configured, skipping mark as used');
    return false;
  }

  const normalizedCode = code.trim().toUpperCase();
  const db = dbClient.getDb();

  try {
    await db
      .update(inviteCodes)
      .set({
        useCount: sql`${inviteCodes.useCount} + 1`,
        usedBy: userId,
        usedAt: new Date(),
      })
      .where(eq(inviteCodes.code, normalizedCode));

    console.log(`[InviteCode] Marked code ${normalizedCode} as used by user ${userId}`);
    return true;
  } catch (error) {
    console.error('[InviteCode] Error marking code as used:', error);
    return false;
  }
}

/**
 * Check if invite codes are required for signup
 * Returns true if REQUIRE_INVITE_CODE env var is set to 'true'
 * Defaults to false for backward compatibility
 */
export function isInviteCodeRequired(): boolean {
  return process.env.REQUIRE_INVITE_CODE === 'true';
}
