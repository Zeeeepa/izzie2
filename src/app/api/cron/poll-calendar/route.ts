/**
 * Calendar Polling Cron Endpoint
 *
 * Polls Google Calendar for upcoming events and changes,
 * classifies them, and routes alerts to notification channels.
 *
 * Call every 15 minutes via Vercel Cron or Upstash.
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { dbClient } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { CalendarService } from '@/lib/google/calendar';
import { getTelegramLink } from '@/lib/telegram/linking';
import { TelegramBot } from '@/lib/telegram/bot';
import {
  classifyCalendarEvent,
  routeAlert,
  AlertLevel,
  DEFAULT_CONFIG,
  type ClassificationConfig,
} from '@/lib/alerts';
import { getLastPollTime, updateLastPollTime } from '@/lib/alerts/poll-state';

const LOG_PREFIX = '[PollCalendar]';

// Look ahead for events (24 hours)
const LOOKAHEAD_HOURS = 24;

// Reminder thresholds (in minutes)
const REMINDER_THRESHOLDS = [60, 15]; // 1 hour and 15 minutes before

// Vercel cron configuration
export const maxDuration = 60; // 60 seconds max

/**
 * Create OAuth2 client with tokens
 */
function createOAuth2Client(
  accessToken: string,
  refreshToken: string | null
): InstanceType<typeof google.auth.OAuth2> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return oauth2Client;
}

/**
 * Check if event starts within threshold minutes
 */
function isEventStartingSoon(
  event: { start: { dateTime: string; timeZone?: string } },
  thresholdMinutes: number
): boolean {
  const startTime = new Date(event.start.dateTime);

  const now = new Date();
  const minutesUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60);

  // Event is starting within the threshold window (e.g., 58-62 minutes for 60-min threshold)
  return minutesUntilStart > 0 && minutesUntilStart <= thresholdMinutes + 2;
}

/**
 * Track which events we've already sent reminders for
 * Key: eventId:thresholdMinutes
 */
const sentReminders: Set<string> = new Set();

/**
 * Poll calendar for a single user
 */
async function pollUserCalendar(
  userId: string,
  telegramBot: TelegramBot
): Promise<{ processed: number; alerts: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let alertsSent = 0;

  try {
    // Get user's Google tokens
    const tokens = await getGoogleTokens(userId);
    if (!tokens?.accessToken) {
      console.log(`${LOG_PREFIX} No Google tokens for user ${userId}`);
      return { processed: 0, alerts: 0, errors: ['No Google tokens'] };
    }

    // Get user's Telegram link
    const telegramLink = await getTelegramLink(userId);
    if (!telegramLink) {
      console.log(`${LOG_PREFIX} No Telegram link for user ${userId}`);
      return { processed: 0, alerts: 0, errors: ['No Telegram link'] };
    }

    const now = new Date();
    const timeMax = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

    console.log(
      `${LOG_PREFIX} Polling calendar for user ${userId} from ${now.toISOString()} to ${timeMax.toISOString()}`
    );

    // Create Calendar service
    const oauth2Client = createOAuth2Client(tokens.accessToken, tokens.refreshToken);

    // Handle token refresh
    oauth2Client.on('tokens', async (newTokens) => {
      if (newTokens.access_token) {
        await updateGoogleTokens(userId, {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || tokens.refreshToken,
          expiry_date: newTokens.expiry_date || undefined,
        });
      }
    });

    const calendarService = new CalendarService(oauth2Client);

    // Fetch upcoming events
    const result = await calendarService.fetchEvents({
      timeMin: now,
      timeMax,
      maxResults: 50,
    });

    console.log(`${LOG_PREFIX} Found ${result.events.length} upcoming events for user ${userId}`);

    // Build classification config
    const config: ClassificationConfig = {
      ...DEFAULT_CONFIG,
      vipSenders: [], // TODO: Load from preferences
    };

    // Create Telegram send function
    const sendTelegram = async (message: string): Promise<boolean> => {
      try {
        await telegramBot.send(telegramLink.telegramChatId.toString(), message, 'Markdown');
        return true;
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to send Telegram:`, error);
        return false;
      }
    };

    // Process each event for reminders
    for (const event of result.events) {
      try {
        processed++;

        // Check each reminder threshold
        for (const threshold of REMINDER_THRESHOLDS) {
          const reminderKey = `${event.id}:${threshold}`;

          // Skip if we've already sent this reminder
          if (sentReminders.has(reminderKey)) {
            continue;
          }

          // Check if event is starting within this threshold
          if (isEventStartingSoon(event, threshold)) {
            // Classify the event
            const alert = classifyCalendarEvent(event, config);

            // Only route non-silent alerts
            if (alert.level !== AlertLevel.P3_SILENT) {
              const deliveryResult = await routeAlert(alert, config, sendTelegram);
              if (deliveryResult.success && deliveryResult.deliveredAt) {
                alertsSent++;
                sentReminders.add(reminderKey);

                console.log(
                  `${LOG_PREFIX} Sent ${threshold}min reminder for "${event.summary}" (${alert.level})`
                );
              }
            }
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Event ${event.id}: ${errorMsg}`);
        console.error(`${LOG_PREFIX} Error processing event ${event.id}:`, error);
      }
    }

    // Update last poll time
    await updateLastPollTime(userId, 'calendar');

    // Clean up old reminder keys (older than 2 hours)
    // This prevents memory leak from accumulating reminder keys
    const twoHoursAgo = now.getTime() - 2 * 60 * 60 * 1000;
    for (const key of sentReminders) {
      const eventId = key.split(':')[0];
      const event = result.events.find((e) => e.id === eventId);
      if (event) {
        const startTime = new Date(event.start.dateTime).getTime();
        if (startTime < twoHoursAgo) {
          sentReminders.delete(key);
        }
      }
    }

    return { processed, alerts: alertsSent, errors };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMsg);
    console.error(`${LOG_PREFIX} Error polling user ${userId}:`, error);
    return { processed, alerts: alertsSent, errors };
  }
}

/**
 * GET /api/cron/poll-calendar
 *
 * Polls all users with connected Calendar and Telegram
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

  try {
    // Get all users
    const db = dbClient.getDb();
    const allUsers = await db.select({ id: users.id }).from(users);

    console.log(`${LOG_PREFIX} Starting poll for ${allUsers.length} users`);

    const results: Array<{
      userId: string;
      processed: number;
      alerts: number;
      errors: string[];
    }> = [];

    // Process users sequentially to avoid rate limits
    for (const user of allUsers) {
      const result = await pollUserCalendar(user.id, telegramBot);
      results.push({ userId: user.id, ...result });
    }

    const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
    const totalAlerts = results.reduce((sum, r) => sum + r.alerts, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const duration = Date.now() - startTime;

    console.log(
      `${LOG_PREFIX} Poll complete: ${totalProcessed} events, ${totalAlerts} alerts, ${totalErrors} errors in ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      summary: {
        users: allUsers.length,
        eventsProcessed: totalProcessed,
        alertsSent: totalAlerts,
        errors: totalErrors,
        durationMs: duration,
      },
      results,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Poll failed:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
