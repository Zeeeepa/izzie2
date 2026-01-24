/**
 * Notification History Management
 * Tracks sent notifications to prevent duplicates
 */

import { dbClient } from '@/lib/db';
import { notificationHistory } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { AlertSource, NotificationChannel } from './types';

const LOG_PREFIX = '[NotificationHistory]';

/**
 * Check if a notification has already been sent for this source item
 */
export async function hasNotificationBeenSent(
  userId: string,
  sourceId: string,
  channel: NotificationChannel
): Promise<boolean> {
  try {
    const db = dbClient.getDb();

    const existing = await db
      .select({ id: notificationHistory.id })
      .from(notificationHistory)
      .where(
        and(
          eq(notificationHistory.userId, userId),
          eq(notificationHistory.sourceId, sourceId),
          eq(notificationHistory.channel, channel)
        )
      )
      .limit(1);

    return existing.length > 0;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error checking notification history:`, error);
    // On error, return false to allow sending (fail open for notifications)
    return false;
  }
}

/**
 * Record a notification that was successfully sent
 */
export async function recordNotification(
  userId: string,
  sourceType: AlertSource,
  sourceId: string,
  alertLevel: string,
  channel: NotificationChannel
): Promise<void> {
  try {
    const db = dbClient.getDb();

    await db
      .insert(notificationHistory)
      .values({
        userId,
        sourceType,
        sourceId,
        alertLevel,
        channel,
        deliveredAt: new Date(),
      })
      .onConflictDoNothing(); // Ignore if already exists

    console.log(
      `${LOG_PREFIX} Recorded ${channel} notification for ${sourceType}:${sourceId.slice(0, 8)}...`
    );
  } catch (error) {
    // Log but don't throw - recording failure shouldn't block the flow
    console.error(`${LOG_PREFIX} Error recording notification:`, error);
  }
}
