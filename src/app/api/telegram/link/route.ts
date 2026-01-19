/**
 * Telegram Link API
 * Manages Telegram account linking for authenticated users
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { generateLinkCode, getTelegramLink, unlinkTelegram } from '@/lib/telegram/linking';

/**
 * GET /api/telegram/link
 * Check Telegram link status for authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const link = await getTelegramLink(session.user.id);

    return NextResponse.json({
      linked: link !== null,
      username: link?.telegramUsername ?? undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Authentication required',
      },
      { status: 401 }
    );
  }
}

/**
 * POST /api/telegram/link
 * Generate a new link code for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const code = await generateLinkCode(session.user.id);

    return NextResponse.json({
      code,
      expiresIn: 300,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Authentication required',
      },
      { status: 401 }
    );
  }
}

/**
 * DELETE /api/telegram/link
 * Unlink Telegram account from authenticated user
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    await unlinkTelegram(session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Authentication required',
      },
      { status: 401 }
    );
  }
}
