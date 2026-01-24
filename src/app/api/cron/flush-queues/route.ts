/**
 * Notification Queue Flush Cron Endpoint
 *
 * Flushes pending notification queues:
 * - P2 batch alerts: Hourly digest for informational alerts
 * - Quiet hours alerts: Sends queued alerts when quiet hours end
 *
 * Call every 15-30 minutes via Vercel Cron or Upstash.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTelegramLink } from '@/lib/telegram/linking';
import { TelegramBot } from '@/lib/telegram/bot';
import {
  flushAllP2Batches,
  flushQuietHoursQueue,
  getQueueStats,
} from '@/lib/alerts';

const LOG_PREFIX = '[FlushQueues]';

// Vercel cron configuration
export const maxDuration = 60; // 60 seconds max

/**
 * Create a function to get Telegram sender for a user
 */
function createGetSendTelegram(telegramBot: TelegramBot) {
  return async (userId: string): Promise<((message: string) => Promise<boolean>) | null> => {
    const telegramLink = await getTelegramLink(userId);
    if (!telegramLink) {
      return null;
    }

    return async (message: string): Promise<boolean> => {
      try {
        await telegramBot.send(telegramLink.telegramChatId.toString(), message, 'Markdown');
        return true;
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to send Telegram for user ${userId}:`, error);
        return false;
      }
    };
  };
}

/**
 * GET /api/cron/flush-queues
 *
 * Flushes all pending notification queues:
 * - Sends P2 batch digests to all users with pending items
 * - Sends quiet hours alerts for users whose quiet hours have ended
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Verify cron secret (for Vercel Cron)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log(`${LOG_PREFIX} Unauthorized cron request`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check Telegram bot token
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error(`${LOG_PREFIX} TELEGRAM_BOT_TOKEN not configured`);
    return NextResponse.json({ error: 'Telegram not configured' }, { status: 500 });
  }

  const telegramBot = new TelegramBot(botToken);
  const getSendTelegram = createGetSendTelegram(telegramBot);

  try {
    // Get initial queue stats
    const initialStats = await getQueueStats();
    console.log(
      `${LOG_PREFIX} Starting flush - P2 batch: ${initialStats.p2QueueSize}, Quiet hours: ${initialStats.quietHoursQueueSize}`
    );

    // Flush P2 batch queues for all users
    const batchResults = await flushAllP2Batches(getSendTelegram);
    const batchSuccessCount = Array.from(batchResults.values()).filter((r) => r.success).length;
    const batchFailCount = batchResults.size - batchSuccessCount;

    console.log(
      `${LOG_PREFIX} P2 batch flush: ${batchSuccessCount} succeeded, ${batchFailCount} failed`
    );

    // Flush quiet hours queue
    const quietHoursResults = await flushQuietHoursQueue(getSendTelegram);
    const quietHoursSuccessCount = quietHoursResults.filter((r) => r.success).length;
    const quietHoursFailCount = quietHoursResults.length - quietHoursSuccessCount;

    console.log(
      `${LOG_PREFIX} Quiet hours flush: ${quietHoursSuccessCount} succeeded, ${quietHoursFailCount} failed`
    );

    // Get final queue stats
    const finalStats = await getQueueStats();
    const duration = Date.now() - startTime;

    console.log(
      `${LOG_PREFIX} Flush complete in ${duration}ms - Remaining P2: ${finalStats.p2QueueSize}, Remaining quiet hours: ${finalStats.quietHoursQueueSize}`
    );

    return NextResponse.json({
      success: true,
      summary: {
        durationMs: duration,
        p2Batch: {
          usersProcessed: batchResults.size,
          succeeded: batchSuccessCount,
          failed: batchFailCount,
        },
        quietHours: {
          alertsProcessed: quietHoursResults.length,
          succeeded: quietHoursSuccessCount,
          failed: quietHoursFailCount,
        },
        queuesRemaining: {
          p2QueueSize: finalStats.p2QueueSize,
          quietHoursQueueSize: finalStats.quietHoursQueueSize,
        },
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Flush failed:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
