import { NextRequest, NextResponse } from 'next/server';
import { dbClient } from '@/lib/db';
import { inviteCodes } from '@/lib/db/schema';
import { eq, and, or, isNull, gt, lt } from 'drizzle-orm';

/**
 * POST /api/invite/validate
 * Validates an invite code for use during signup
 *
 * Request body: { code: string }
 * Response: { valid: boolean, message?: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Check if database is configured
    if (!dbClient.isConfigured()) {
      return NextResponse.json(
        { valid: false, message: 'Service unavailable' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { valid: false, message: 'Invite code is required' },
        { status: 400 }
      );
    }

    // Normalize the code (uppercase, trim whitespace)
    const normalizedCode = code.trim().toUpperCase();

    const db = dbClient.getDb();

    // Look up the invite code
    const [inviteCode] = await db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.code, normalizedCode))
      .limit(1);

    // Code doesn't exist
    if (!inviteCode) {
      return NextResponse.json(
        { valid: false, message: 'Invalid invite code' },
        { status: 200 }
      );
    }

    // Check if code has expired
    if (inviteCode.expiresAt && new Date(inviteCode.expiresAt) < new Date()) {
      return NextResponse.json(
        { valid: false, message: 'This invite code has expired' },
        { status: 200 }
      );
    }

    // Check if code has been fully used
    if (inviteCode.useCount >= inviteCode.maxUses) {
      return NextResponse.json(
        { valid: false, message: 'This invite code has already been used' },
        { status: 200 }
      );
    }

    // Code is valid
    return NextResponse.json(
      { valid: true, message: 'Invite code is valid' },
      { status: 200 }
    );
  } catch (error) {
    console.error('[InviteValidate] Error:', error);
    return NextResponse.json(
      { valid: false, message: 'An error occurred while validating the code' },
      { status: 500 }
    );
  }
}
