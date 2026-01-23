/**
 * API Key Management Endpoint (Individual Key)
 *
 * DELETE /api/user/api-keys/[id] - Revoke an API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { revokeApiKey } from '@/lib/auth/api-keys';

const LOG_PREFIX = '[API Keys Route]';

/**
 * DELETE /api/user/api-keys/[id]
 * Revoke an API key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { id: keyId } = await params;

    if (!keyId) {
      return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
    }

    const revoked = await revokeApiKey(keyId, userId);

    if (!revoked) {
      return NextResponse.json(
        { error: 'API key not found or already revoked' },
        { status: 404 }
      );
    }

    console.log(`${LOG_PREFIX} Revoked API key: ${keyId} for user: ${userId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`${LOG_PREFIX} DELETE error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
