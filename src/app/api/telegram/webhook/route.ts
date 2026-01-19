/**
 * Telegram Webhook Endpoint
 *
 * Receives updates from Telegram Bot API.
 * Handles:
 * - /start <code> - Account linking with verification code
 * - /start - Welcome message with linking instructions
 * - Regular messages - Process through chat system for linked users
 */

import { NextRequest, NextResponse } from 'next/server';
import type { TelegramUpdate } from '@/lib/telegram/types';
import { getTelegramBot } from '@/lib/telegram/bot';
import { verifyLinkCode, getUserByTelegramChatId } from '@/lib/telegram/linking';
import { processAndReply } from '@/lib/telegram/message-handler';

const LOG_PREFIX = '[TelegramWebhook]';

/**
 * Messages sent to users
 */
const MESSAGES = {
  WELCOME: `Welcome to Izzie! To link your Telegram account:

1. Go to izzie.ai and sign in
2. Navigate to Settings > Telegram
3. Click "Link Telegram" to get a code
4. Send the code here: /start <code>`,
  LINK_SUCCESS: (name: string) =>
    `Your Telegram is now linked! Hi ${name}, I'm Izzie, your personal AI assistant. You can chat with me anytime here.`,
  LINK_FAILED: 'That code is invalid or has expired. Please get a new code from izzie.ai/settings.',
  NOT_LINKED: `Your Telegram account isn't linked yet. Please visit izzie.ai/settings to get a linking code.`,
};

/**
 * Verify webhook secret token
 */
function verifyWebhookSecret(request: NextRequest): boolean {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.warn(`${LOG_PREFIX} TELEGRAM_WEBHOOK_SECRET not configured`);
    return false;
  }

  return secret === expectedSecret;
}

/**
 * Extract code from /start command
 * Returns null if not a /start command with code
 */
function extractStartCode(text: string): string | null {
  const match = text.match(/^\/start\s+(\d{6})$/);
  return match ? match[1] : null;
}

/**
 * Check if message is a plain /start command
 */
function isPlainStart(text: string): boolean {
  return text.trim() === '/start';
}

/**
 * POST handler for Telegram webhook updates
 *
 * Always returns 200 to acknowledge receipt (Telegram retries on non-200)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify webhook secret
    if (!verifyWebhookSecret(request)) {
      console.warn(`${LOG_PREFIX} Invalid or missing webhook secret`);
      // Return 200 anyway to prevent Telegram retries
      return NextResponse.json({ ok: true });
    }

    // Parse update
    const update: TelegramUpdate = await request.json();
    console.log(`${LOG_PREFIX} Received update ${update.update_id}`);

    // Only handle messages with text
    const message = update.message;
    if (!message?.text || !message.chat) {
      console.log(`${LOG_PREFIX} Ignoring non-text or incomplete update`);
      return NextResponse.json({ ok: true });
    }

    const chatId = BigInt(message.chat.id);
    const text = message.text.trim();
    const username = message.from?.username;

    const bot = getTelegramBot();

    // Handle /start <code> command - verify link code
    const code = extractStartCode(text);
    if (code) {
      console.log(`${LOG_PREFIX} Processing link code from chat ${chatId}`);

      const result = await verifyLinkCode(code, chatId, username);

      if (result.success) {
        // Get user name for personalized welcome
        const { users } = await import('@/lib/db/schema');
        const { dbClient } = await import('@/lib/db');
        const { eq } = await import('drizzle-orm');

        const db = dbClient.getDb();
        const [user] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, result.userId!))
          .limit(1);

        const userName = user?.name || 'there';
        await bot.send(chatId.toString(), MESSAGES.LINK_SUCCESS(userName));
        console.log(`${LOG_PREFIX} Successfully linked chat ${chatId} to user ${result.userId}`);
      } else {
        await bot.send(chatId.toString(), MESSAGES.LINK_FAILED);
        console.log(`${LOG_PREFIX} Link code verification failed: ${result.error}`);
      }

      return NextResponse.json({ ok: true });
    }

    // Handle plain /start command - send welcome message
    if (isPlainStart(text)) {
      await bot.send(chatId.toString(), MESSAGES.WELCOME);
      console.log(`${LOG_PREFIX} Sent welcome message to chat ${chatId}`);
      return NextResponse.json({ ok: true });
    }

    // Handle regular messages - check if linked and process
    const userId = await getUserByTelegramChatId(chatId);

    if (!userId) {
      await bot.send(chatId.toString(), MESSAGES.NOT_LINKED);
      console.log(`${LOG_PREFIX} Unlinked user attempted to chat from ${chatId}`);
      return NextResponse.json({ ok: true });
    }

    // Process message through chat system
    await processAndReply(userId, chatId, text);

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Log error but always return 200 to prevent Telegram retries
    console.error(`${LOG_PREFIX} Error processing webhook:`, error);
    return NextResponse.json({ ok: true });
  }
}
