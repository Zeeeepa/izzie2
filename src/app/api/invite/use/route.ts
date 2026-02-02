import { NextRequest, NextResponse } from 'next/server';
import { dbClient } from '@/lib/db';
import { inviteCodes, users } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

/**
 * POST /api/invite/use
 * Marks an invite code as used by the current authenticated user
 * Called after OAuth completes for new user signups
 *
 * Request body: { code: string }
 * Response: { success: boolean, message?: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Check if database is configured
    if (!dbClient.isConfigured()) {
      return NextResponse.json(
        { success: false, message: 'Service unavailable' },
        { status: 503 }
      );
    }

    // Get authenticated user
    const session = await getSession(request);
    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Invite code is required' },
        { status: 400 }
      );
    }

    const normalizedCode = code.trim().toUpperCase();
    const db = dbClient.getDb();

    // Look up the invite code
    const [inviteCode] = await db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.code, normalizedCode))
      .limit(1);

    if (!inviteCode) {
      return NextResponse.json(
        { success: false, message: 'Invalid invite code' },
        { status: 200 }
      );
    }

    // Check if code has expired
    if (inviteCode.expiresAt && new Date(inviteCode.expiresAt) < new Date()) {
      return NextResponse.json(
        { success: false, message: 'This invite code has expired' },
        { status: 200 }
      );
    }

    // Check if code has been fully used
    if (inviteCode.useCount >= inviteCode.maxUses) {
      return NextResponse.json(
        { success: false, message: 'This invite code has already been used' },
        { status: 200 }
      );
    }

    // Mark the code as used
    await db
      .update(inviteCodes)
      .set({
        useCount: sql`${inviteCodes.useCount} + 1`,
        usedBy: session.user.id,
        usedAt: new Date(),
      })
      .where(eq(inviteCodes.code, normalizedCode));

    console.log(`[InviteUse] Code ${normalizedCode} used by user ${session.user.id}`);

    return NextResponse.json(
      { success: true, message: 'Invite code redeemed successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('[InviteUse] Error:', error);
    return NextResponse.json(
      { success: false, message: 'An error occurred' },
      { status: 500 }
    );
  }
}
