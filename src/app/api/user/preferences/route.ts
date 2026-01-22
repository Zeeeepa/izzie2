/**
 * User Preferences API
 * GET/PUT for managing user writing style and customization preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbClient } from '@/lib/db';
import { userPreferences, WRITING_STYLES, TONES } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const LOG_PREFIX = '[User Preferences API]';

const defaults = {
  writingStyle: WRITING_STYLES.PROFESSIONAL,
  tone: TONES.FRIENDLY,
  customInstructions: null as string | null,
};

const validWritingStyles = Object.values(WRITING_STYLES);
const validTones = Object.values(TONES);

/**
 * GET /api/user/preferences
 * Get user's preferences or create defaults if not set
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const db = dbClient.getDb();
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (!prefs) {
      // Return defaults without persisting
      return NextResponse.json({
        preferences: {
          userId,
          writingStyle: defaults.writingStyle,
          tone: defaults.tone,
          customInstructions: defaults.customInstructions,
        },
        isDefault: true,
      });
    }

    return NextResponse.json({
      preferences: {
        userId: prefs.userId,
        writingStyle: prefs.writingStyle,
        tone: prefs.tone,
        customInstructions: prefs.customInstructions,
      },
      isDefault: false,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} GET error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/user/preferences
 * Update user's preferences (upsert)
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const {
      writingStyle = defaults.writingStyle,
      tone = defaults.tone,
      customInstructions = defaults.customInstructions,
    } = body;

    // Validate writingStyle
    if (!validWritingStyles.includes(writingStyle)) {
      return NextResponse.json(
        { error: `Invalid writingStyle. Valid options: ${validWritingStyles.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate tone
    if (!validTones.includes(tone)) {
      return NextResponse.json(
        { error: `Invalid tone. Valid options: ${validTones.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate customInstructions (optional, max 2000 chars)
    if (customInstructions !== null && typeof customInstructions !== 'string') {
      return NextResponse.json(
        { error: 'customInstructions must be a string or null' },
        { status: 400 }
      );
    }

    if (customInstructions && customInstructions.length > 2000) {
      return NextResponse.json(
        { error: 'customInstructions must be 2000 characters or less' },
        { status: 400 }
      );
    }

    const db = dbClient.getDb();

    // Upsert preferences
    const [existing] = await db
      .select({ id: userPreferences.id })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(userPreferences)
        .set({
          writingStyle,
          tone,
          customInstructions,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId));
    } else {
      await db.insert(userPreferences).values({
        userId,
        writingStyle,
        tone,
        customInstructions,
      });
    }

    console.log(`${LOG_PREFIX} Updated preferences for user:`, userId);

    return NextResponse.json({
      success: true,
      preferences: {
        userId,
        writingStyle,
        tone,
        customInstructions,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} PUT error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
