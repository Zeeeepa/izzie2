/**
 * Notification Queue Service
 * Persists P2 batch and quiet hours queues to database
 */

import { dbClient } from '@/lib/db';
import { notificationQueue, QUEUE_TYPES } from '@/lib/db/schema';
import { eq, and, lte, inArray } from 'drizzle-orm';
import type { ClassifiedAlert, AlertSource, QueueType } from './types';

const LOG_PREFIX = '[NotificationQueue]';

/**
 * Payload stored in database queue
 */
interface QueuePayload {
  title: string;
  body: string;
  signals: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Add an alert to the queue
 */
export async function addToQueue(
  userId: string,
  queueType: QueueType,
  alert: ClassifiedAlert,
  scheduledFor?: Date
): Promise<string> {
  const db = dbClient.getDb();

  const payload: QueuePayload = {
    title: alert.title,
    body: alert.body,
    signals: alert.signals,
    metadata: alert.metadata,
  };

  const [result] = await db
    .insert(notificationQueue)
    .values({
      userId,
      sourceType: alert.source,
      sourceId: alert.sourceId,
      alertLevel: alert.level,
      queueType,
      payload,
      scheduledFor,
    })
    .returning({ id: notificationQueue.id });

  console.log(
    `${LOG_PREFIX} Added ${alert.level} alert to ${queueType} queue for user ${userId.slice(0, 8)}...`
  );

  return result.id;
}

/**
 * Get all queued alerts for a user by queue type
 */
export async function getQueuedAlerts(
  userId: string,
  queueType: QueueType
): Promise<
  Array<{
    id: string;
    alert: ClassifiedAlert;
    queuedAt: Date;
  }>
> {
  const db = dbClient.getDb();

  const items = await db
    .select()
    .from(notificationQueue)
    .where(
      and(
        eq(notificationQueue.userId, userId),
        eq(notificationQueue.queueType, queueType)
      )
    )
    .orderBy(notificationQueue.createdAt);

  return items.map((item) => ({
    id: item.id,
    alert: reconstructAlert(item),
    queuedAt: item.createdAt,
  }));
}

/**
 * Remove a single item from the queue
 */
export async function removeFromQueue(id: string): Promise<void> {
  const db = dbClient.getDb();

  await db
    .delete(notificationQueue)
    .where(eq(notificationQueue.id, id));

  console.log(`${LOG_PREFIX} Removed item ${id.slice(0, 8)}... from queue`);
}

/**
 * Remove multiple items from the queue
 */
export async function removeFromQueueBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const db = dbClient.getDb();

  await db
    .delete(notificationQueue)
    .where(inArray(notificationQueue.id, ids));

  console.log(`${LOG_PREFIX} Removed ${ids.length} items from queue`);
}

/**
 * Flush P2 batch queue for a user - get and remove all P2 alerts
 */
export async function flushBatchQueue(userId: string): Promise<ClassifiedAlert[]> {
  const db = dbClient.getDb();

  // Get all P2 batch items for this user
  const items = await db
    .select()
    .from(notificationQueue)
    .where(
      and(
        eq(notificationQueue.userId, userId),
        eq(notificationQueue.queueType, QUEUE_TYPES.BATCH)
      )
    )
    .orderBy(notificationQueue.createdAt);

  if (items.length === 0) {
    return [];
  }

  // Remove all items (do this before returning to avoid duplicates on retry)
  const ids = items.map((item) => item.id);
  await removeFromQueueBatch(ids);

  console.log(`${LOG_PREFIX} Flushed ${items.length} P2 batch items for user ${userId.slice(0, 8)}...`);

  // Return reconstructed alerts
  return items.map(reconstructAlert);
}

/**
 * Get alerts ready to send after quiet hours end
 * Returns alerts where scheduledFor <= now
 */
export async function getReadyQuietHoursAlerts(): Promise<
  Array<{
    id: string;
    userId: string;
    alert: ClassifiedAlert;
  }>
> {
  const db = dbClient.getDb();
  const now = new Date();

  const items = await db
    .select()
    .from(notificationQueue)
    .where(
      and(
        eq(notificationQueue.queueType, QUEUE_TYPES.QUIET_HOURS),
        lte(notificationQueue.scheduledFor, now)
      )
    )
    .orderBy(notificationQueue.scheduledFor);

  return items.map((item) => ({
    id: item.id,
    userId: item.userId,
    alert: reconstructAlert(item),
  }));
}

/**
 * Get all users with pending P2 batch items
 */
export async function getUsersWithPendingBatch(): Promise<string[]> {
  const db = dbClient.getDb();

  const result = await db
    .selectDistinct({ userId: notificationQueue.userId })
    .from(notificationQueue)
    .where(eq(notificationQueue.queueType, QUEUE_TYPES.BATCH));

  return result.map((r) => r.userId);
}

/**
 * Get queue stats for monitoring
 */
export async function getQueueStats(userId?: string): Promise<{
  batchQueueSize: number;
  quietHoursQueueSize: number;
}> {
  const db = dbClient.getDb();

  const conditions = userId
    ? and(
        eq(notificationQueue.userId, userId),
        eq(notificationQueue.queueType, QUEUE_TYPES.BATCH)
      )
    : eq(notificationQueue.queueType, QUEUE_TYPES.BATCH);

  const quietConditions = userId
    ? and(
        eq(notificationQueue.userId, userId),
        eq(notificationQueue.queueType, QUEUE_TYPES.QUIET_HOURS)
      )
    : eq(notificationQueue.queueType, QUEUE_TYPES.QUIET_HOURS);

  const [batchItems, quietItems] = await Promise.all([
    db
      .select({ id: notificationQueue.id })
      .from(notificationQueue)
      .where(conditions),
    db
      .select({ id: notificationQueue.id })
      .from(notificationQueue)
      .where(quietConditions),
  ]);

  return {
    batchQueueSize: batchItems.length,
    quietHoursQueueSize: quietItems.length,
  };
}

/**
 * Clear all queues for a user (for testing)
 */
export async function clearUserQueues(userId: string): Promise<void> {
  const db = dbClient.getDb();

  await db
    .delete(notificationQueue)
    .where(eq(notificationQueue.userId, userId));

  console.log(`${LOG_PREFIX} Cleared all queues for user ${userId.slice(0, 8)}...`);
}

/**
 * Reconstruct a ClassifiedAlert from a queue item
 */
function reconstructAlert(item: {
  sourceType: string;
  sourceId: string;
  alertLevel: string;
  payload: QueuePayload | null;
  createdAt: Date;
}): ClassifiedAlert {
  const payload = item.payload as QueuePayload;

  return {
    level: item.alertLevel as ClassifiedAlert['level'],
    title: payload?.title ?? '',
    body: payload?.body ?? '',
    source: item.sourceType as AlertSource,
    sourceId: item.sourceId,
    signals: payload?.signals ?? [],
    timestamp: item.createdAt,
    metadata: payload?.metadata,
  };
}
