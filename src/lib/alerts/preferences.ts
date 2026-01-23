/**
 * Alert Preferences Service
 * Loads and saves user alert preferences for the classification system
 */

import { eq } from 'drizzle-orm';
import { dbClient } from '@/lib/db';
import { alertPreferences } from '@/lib/db/schema';
import { DEFAULT_CONFIG, type ClassificationConfig } from './types';

const LOG_PREFIX = '[AlertPreferences]';

/**
 * Get alert preferences for a user, with defaults if not set
 */
export async function getAlertPreferences(
  userId: string
): Promise<ClassificationConfig> {
  try {
    const db = dbClient.getDb();

    const [prefs] = await db
      .select()
      .from(alertPreferences)
      .where(eq(alertPreferences.userId, userId))
      .limit(1);

    if (!prefs) {
      console.log(`${LOG_PREFIX} No preferences found for ${userId}, using defaults`);
      return DEFAULT_CONFIG;
    }

    return {
      vipSenders: prefs.vipSenders || [],
      urgentKeywords: [
        ...DEFAULT_CONFIG.urgentKeywords,
        ...(prefs.customUrgentKeywords || []),
      ],
      quietHours: {
        enabled: prefs.quietHoursEnabled,
        start: prefs.quietHoursStart,
        end: prefs.quietHoursEnd,
        timezone: prefs.quietHoursTimezone,
      },
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error loading preferences for ${userId}:`, error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Get raw alert preferences record (for API/UI)
 */
export async function getAlertPreferencesRaw(userId: string) {
  const db = dbClient.getDb();

  const [prefs] = await db
    .select()
    .from(alertPreferences)
    .where(eq(alertPreferences.userId, userId))
    .limit(1);

  return prefs || null;
}

/**
 * Create or update alert preferences
 */
export async function upsertAlertPreferences(
  userId: string,
  data: Partial<{
    vipSenders: string[];
    customUrgentKeywords: string[];
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    quietHoursTimezone: string;
    telegramEnabled: boolean;
    emailEnabled: boolean;
    notifyOnP0: boolean;
    notifyOnP1: boolean;
    notifyOnP2: boolean;
  }>
) {
  const db = dbClient.getDb();

  const existing = await getAlertPreferencesRaw(userId);

  if (existing) {
    // Update existing
    const [updated] = await db
      .update(alertPreferences)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(alertPreferences.userId, userId))
      .returning();

    console.log(`${LOG_PREFIX} Updated preferences for ${userId}`);
    return updated;
  } else {
    // Create new
    const [created] = await db
      .insert(alertPreferences)
      .values({
        userId,
        ...data,
      })
      .returning();

    console.log(`${LOG_PREFIX} Created preferences for ${userId}`);
    return created;
  }
}

/**
 * Add a VIP sender
 */
export async function addVipSender(userId: string, email: string) {
  const prefs = await getAlertPreferencesRaw(userId);
  const currentVips = prefs?.vipSenders || [];

  const normalizedEmail = email.toLowerCase().trim();

  if (currentVips.includes(normalizedEmail)) {
    return prefs; // Already exists
  }

  return upsertAlertPreferences(userId, {
    vipSenders: [...currentVips, normalizedEmail],
  });
}

/**
 * Remove a VIP sender
 */
export async function removeVipSender(userId: string, email: string) {
  const prefs = await getAlertPreferencesRaw(userId);
  const currentVips = prefs?.vipSenders || [];

  const normalizedEmail = email.toLowerCase().trim();

  return upsertAlertPreferences(userId, {
    vipSenders: currentVips.filter((e) => e !== normalizedEmail),
  });
}
