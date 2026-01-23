/**
 * Alert Preferences API
 * GET - Fetch user's alert preferences
 * PUT - Update user's alert preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import {
  getAlertPreferencesRaw,
  upsertAlertPreferences,
} from '@/lib/alerts/preferences';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const preferences = await getAlertPreferencesRaw(session.user.id);

    // Return preferences or defaults
    return NextResponse.json({
      preferences: preferences || {
        vipSenders: [],
        customUrgentKeywords: [],
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        quietHoursTimezone: 'America/New_York',
        telegramEnabled: true,
        emailEnabled: false,
        notifyOnP0: true,
        notifyOnP1: true,
        notifyOnP2: false,
      },
    });
  } catch (error) {
    console.error('[AlertPreferencesAPI] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate and sanitize input
    const updates: Record<string, unknown> = {};

    if (Array.isArray(body.vipSenders)) {
      updates.vipSenders = body.vipSenders
        .map((s: string) => s.toLowerCase().trim())
        .filter(Boolean);
    }

    if (Array.isArray(body.customUrgentKeywords)) {
      updates.customUrgentKeywords = body.customUrgentKeywords
        .map((k: string) => k.toLowerCase().trim())
        .filter(Boolean);
    }

    if (typeof body.quietHoursEnabled === 'boolean') {
      updates.quietHoursEnabled = body.quietHoursEnabled;
    }

    if (typeof body.quietHoursStart === 'string') {
      updates.quietHoursStart = body.quietHoursStart;
    }

    if (typeof body.quietHoursEnd === 'string') {
      updates.quietHoursEnd = body.quietHoursEnd;
    }

    if (typeof body.quietHoursTimezone === 'string') {
      updates.quietHoursTimezone = body.quietHoursTimezone;
    }

    if (typeof body.telegramEnabled === 'boolean') {
      updates.telegramEnabled = body.telegramEnabled;
    }

    if (typeof body.emailEnabled === 'boolean') {
      updates.emailEnabled = body.emailEnabled;
    }

    if (typeof body.notifyOnP0 === 'boolean') {
      updates.notifyOnP0 = body.notifyOnP0;
    }

    if (typeof body.notifyOnP1 === 'boolean') {
      updates.notifyOnP1 = body.notifyOnP1;
    }

    if (typeof body.notifyOnP2 === 'boolean') {
      updates.notifyOnP2 = body.notifyOnP2;
    }

    const preferences = await upsertAlertPreferences(session.user.id, updates);

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('[AlertPreferencesAPI] PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}
