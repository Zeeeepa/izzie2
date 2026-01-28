/**
 * Check Scopes API Route
 *
 * Returns scope check results for the current user's Google account.
 * Used by UI to show warning banners when user has insufficient permissions.
 *
 * GET /api/auth/check-scopes
 * Returns: ScopeCheckResult with permission details
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkUserScopes } from '@/lib/auth/scopes';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await getSession(request);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - authentication required' },
        { status: 401 }
      );
    }

    const scopeCheck = await checkUserScopes(session.user.id);

    return NextResponse.json({
      success: true,
      data: scopeCheck,
    });
  } catch (error) {
    console.error('[Check Scopes] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to check scopes',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
