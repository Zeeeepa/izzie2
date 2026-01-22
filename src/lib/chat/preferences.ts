/**
 * User Preferences Service
 *
 * Fetches user writing style preferences from the database
 * for integration into AI system prompts.
 */

import { dbClient } from '@/lib/db';
import { userPreferences, WRITING_STYLES, TONES, type WritingStyle, type Tone } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const LOG_PREFIX = '[UserPreferences]';

/**
 * User preferences for AI writing style
 */
export interface UserWritingPreferences {
  writingStyle: WritingStyle;
  tone: Tone;
  customInstructions: string | null;
}

/**
 * Default preferences when user has not set any
 */
const DEFAULT_PREFERENCES: UserWritingPreferences = {
  writingStyle: WRITING_STYLES.PROFESSIONAL,
  tone: TONES.FRIENDLY,
  customInstructions: null,
};

/**
 * Fetch user preferences from database
 *
 * Returns default preferences if user has not set any.
 *
 * @param userId - The user's ID
 * @returns User's writing preferences
 */
export async function getUserPreferences(userId: string): Promise<UserWritingPreferences> {
  try {
    const db = dbClient.getDb();

    const [prefs] = await db
      .select({
        writingStyle: userPreferences.writingStyle,
        tone: userPreferences.tone,
        customInstructions: userPreferences.customInstructions,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (!prefs) {
      console.log(`${LOG_PREFIX} No preferences found for user ${userId}, using defaults`);
      return DEFAULT_PREFERENCES;
    }

    console.log(`${LOG_PREFIX} Loaded preferences for user ${userId}: style=${prefs.writingStyle}, tone=${prefs.tone}`);

    return {
      writingStyle: prefs.writingStyle as WritingStyle,
      tone: prefs.tone as Tone,
      customInstructions: prefs.customInstructions,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching preferences for user ${userId}:`, error);
    // Return defaults on error to avoid breaking chat
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Format writing style instructions for AI system prompt
 *
 * Generates natural language instructions based on user preferences.
 *
 * @param preferences - User's writing preferences
 * @returns Formatted instructions string for system prompt
 */
export function formatWritingStyleInstructions(preferences: UserWritingPreferences): string {
  const sections: string[] = [];

  // Writing style instructions
  const styleInstructions: Record<WritingStyle, string> = {
    casual: 'Use a casual, relaxed writing style. Feel free to use contractions, informal language, and a conversational tone.',
    formal: 'Use a formal writing style. Maintain proper grammar, avoid contractions, and use professional language.',
    professional: 'Use a professional but approachable writing style. Balance formality with warmth - be clear and competent while remaining personable.',
  };

  // Tone instructions
  const toneInstructions: Record<Tone, string> = {
    friendly: 'Be warm, encouraging, and supportive in your responses. Show genuine interest and enthusiasm.',
    neutral: 'Maintain a balanced, objective tone. Be helpful without being overly enthusiastic or distant.',
    assertive: 'Be direct and confident in your responses. Provide clear guidance and decisive recommendations.',
  };

  sections.push('**Writing Style Preferences:**');
  sections.push(`- ${styleInstructions[preferences.writingStyle]}`);
  sections.push(`- ${toneInstructions[preferences.tone]}`);

  // Add custom instructions if provided
  if (preferences.customInstructions) {
    sections.push('');
    sections.push('**Custom Instructions from User:**');
    sections.push(preferences.customInstructions);
  }

  return sections.join('\n');
}
