/**
 * Writing Style Analysis Service
 *
 * Analyzes user's email writing patterns to learn:
 * - Formality level (formal, casual, mixed)
 * - Common greetings and sign-offs
 * - Average sentence/email length
 * - Response time patterns
 * - Active working hours
 *
 * Uses this data to suggest appropriate tone for new emails.
 */

import { dbClient } from '@/lib/db';
import { writingStyles, type NewWritingStyle } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const LOG_PREFIX = '[Writing Style]';

/**
 * Writing style analysis for a user or recipient pattern
 */
export interface WritingStyle {
  userId: string;
  recipientPattern?: string; // email domain (e.g., '@company.com') or specific email
  formality: 'formal' | 'casual' | 'mixed';
  averageSentenceLength: number;
  averageEmailLength: number; // in words
  commonGreetings: string[];
  commonSignOffs: string[];
  responseTimeHours: number; // average time to respond
  activeHours: { start: number; end: number }; // 0-23 hour range
}

/**
 * Email data needed for style analysis
 */
export interface EmailForAnalysis {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  sentAt: Date;
  isReply?: boolean;
  inReplyTo?: string; // ID of email being replied to
  receivedAt?: Date; // For calculating response time
}

/**
 * Style suggestion for drafting new emails
 */
export interface StyleSuggestion {
  formality: 'formal' | 'casual' | 'mixed';
  suggestedGreeting: string;
  suggestedSignOff: string;
  toneDescription: string;
  averageLength: number;
  confidence: number; // 0-1 confidence in suggestion
}

// Common formal greetings
const FORMAL_GREETINGS = [
  'dear',
  'good morning',
  'good afternoon',
  'good evening',
  'greetings',
  'to whom it may concern',
];

// Common casual greetings
const CASUAL_GREETINGS = ['hi', 'hey', 'hello', 'yo', 'sup', 'howdy', 'hiya'];

// Common formal sign-offs
const FORMAL_SIGNOFFS = [
  'sincerely',
  'regards',
  'best regards',
  'kind regards',
  'respectfully',
  'yours truly',
  'cordially',
  'with appreciation',
];

// Common casual sign-offs
const CASUAL_SIGNOFFS = [
  'thanks',
  'cheers',
  'best',
  'talk soon',
  'later',
  'peace',
  'xo',
  'sent from my iphone',
];

/**
 * Extract greeting from email body
 */
function extractGreeting(body: string): string | null {
  const lines = body.trim().split('\n');
  if (lines.length === 0) return null;

  const firstLine = lines[0].trim().toLowerCase();

  // Check for common greeting patterns
  const greetingPatterns = [
    /^(hi|hello|hey|dear|good\s+(morning|afternoon|evening)|greetings|howdy)\b/i,
    /^(to whom it may concern)/i,
  ];

  for (const pattern of greetingPatterns) {
    const match = firstLine.match(pattern);
    if (match) {
      // Return original case from first line
      return lines[0].trim().split(/[,\n!]/)[0].trim();
    }
  }

  return null;
}

/**
 * Extract sign-off from email body
 */
function extractSignOff(body: string): string | null {
  const lines = body.trim().split('\n').filter((l) => l.trim());
  if (lines.length < 2) return null;

  // Check last few lines for sign-off
  const lastFewLines = lines.slice(-4);

  for (const line of lastFewLines) {
    const trimmed = line.trim().toLowerCase();

    // Check for common sign-off patterns
    const signOffPatterns = [
      /^(sincerely|regards|best\s+regards|kind\s+regards|respectfully|yours\s+truly|cordially)/i,
      /^(thanks|cheers|best|talk\s+soon|later|peace|with\s+appreciation)/i,
      /^(sent\s+from\s+my)/i,
    ];

    for (const pattern of signOffPatterns) {
      if (pattern.test(trimmed)) {
        return line.trim().replace(/[,!]$/, '');
      }
    }
  }

  return null;
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/**
 * Count sentences in text
 */
function countSentences(text: string): number {
  // Split on sentence-ending punctuation
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  return Math.max(1, sentences.length);
}

/**
 * Determine formality level from greeting and sign-off
 */
function determineFormality(
  greeting: string | null,
  signOff: string | null
): 'formal' | 'casual' | 'mixed' {
  let formalScore = 0;
  let casualScore = 0;

  if (greeting) {
    const greetingLower = greeting.toLowerCase();
    if (FORMAL_GREETINGS.some((g) => greetingLower.startsWith(g))) {
      formalScore++;
    }
    if (CASUAL_GREETINGS.some((g) => greetingLower.startsWith(g))) {
      casualScore++;
    }
  }

  if (signOff) {
    const signOffLower = signOff.toLowerCase();
    if (FORMAL_SIGNOFFS.some((s) => signOffLower.startsWith(s))) {
      formalScore++;
    }
    if (CASUAL_SIGNOFFS.some((s) => signOffLower.startsWith(s))) {
      casualScore++;
    }
  }

  if (formalScore > casualScore) return 'formal';
  if (casualScore > formalScore) return 'casual';
  return 'mixed';
}

/**
 * Analyze writing style from a set of sent emails
 */
export function analyzeWritingStyle(userId: string, emails: EmailForAnalysis[]): WritingStyle {
  console.log(`${LOG_PREFIX} Analyzing ${emails.length} emails for user ${userId}...`);

  if (emails.length === 0) {
    return {
      userId,
      formality: 'mixed',
      averageSentenceLength: 15,
      averageEmailLength: 100,
      commonGreetings: [],
      commonSignOffs: [],
      responseTimeHours: 24,
      activeHours: { start: 9, end: 17 },
    };
  }

  // Extract greetings and sign-offs
  const greetings: string[] = [];
  const signOffs: string[] = [];
  const formalityCounts = { formal: 0, casual: 0, mixed: 0 };
  let totalWords = 0;
  let totalSentences = 0;
  const sendHours: number[] = [];
  const responseTimes: number[] = [];

  for (const email of emails) {
    const greeting = extractGreeting(email.body);
    const signOff = extractSignOff(email.body);

    if (greeting) greetings.push(greeting);
    if (signOff) signOffs.push(signOff);

    const formality = determineFormality(greeting, signOff);
    formalityCounts[formality]++;

    totalWords += countWords(email.body);
    totalSentences += countSentences(email.body);

    // Track send hours
    sendHours.push(email.sentAt.getHours());

    // Calculate response time if this is a reply
    if (email.isReply && email.receivedAt) {
      const responseTime = (email.sentAt.getTime() - email.receivedAt.getTime()) / (1000 * 60 * 60);
      if (responseTime > 0 && responseTime < 168) {
        // Within a week
        responseTimes.push(responseTime);
      }
    }
  }

  // Determine overall formality
  let formality: 'formal' | 'casual' | 'mixed' = 'mixed';
  const totalFormality = formalityCounts.formal + formalityCounts.casual + formalityCounts.mixed;
  if (totalFormality > 0) {
    if (formalityCounts.formal / totalFormality > 0.6) {
      formality = 'formal';
    } else if (formalityCounts.casual / totalFormality > 0.6) {
      formality = 'casual';
    }
  }

  // Find most common greetings and sign-offs
  const greetingCounts = new Map<string, number>();
  for (const g of greetings) {
    const normalized = g.toLowerCase().split(/[,!]/)[0].trim();
    greetingCounts.set(normalized, (greetingCounts.get(normalized) || 0) + 1);
  }

  const signOffCounts = new Map<string, number>();
  for (const s of signOffs) {
    const normalized = s.toLowerCase().replace(/[,!]$/, '').trim();
    signOffCounts.set(normalized, (signOffCounts.get(normalized) || 0) + 1);
  }

  // Sort by frequency and get top 5
  const sortedGreetings = Array.from(greetingCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([g]) => g);

  const sortedSignOffs = Array.from(signOffCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s]) => s);

  // Calculate averages
  const avgWords = emails.length > 0 ? Math.round(totalWords / emails.length) : 100;
  const avgSentenceLength =
    totalSentences > 0 ? Math.round(totalWords / totalSentences) : 15;

  // Calculate active hours
  let activeStart = 9;
  let activeEnd = 17;
  if (sendHours.length > 0) {
    sendHours.sort((a, b) => a - b);
    // Use 10th and 90th percentile
    const p10 = sendHours[Math.floor(sendHours.length * 0.1)];
    const p90 = sendHours[Math.floor(sendHours.length * 0.9)];
    activeStart = p10;
    activeEnd = p90;
  }

  // Calculate average response time
  const avgResponseTime =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 24;

  const style: WritingStyle = {
    userId,
    formality,
    averageSentenceLength: avgSentenceLength,
    averageEmailLength: avgWords,
    commonGreetings: sortedGreetings,
    commonSignOffs: sortedSignOffs,
    responseTimeHours: avgResponseTime,
    activeHours: { start: activeStart, end: activeEnd },
  };

  console.log(`${LOG_PREFIX} Analysis complete:`, {
    formality: style.formality,
    greetings: style.commonGreetings.length,
    signOffs: style.commonSignOffs.length,
    avgLength: style.averageEmailLength,
  });

  return style;
}

/**
 * Analyze writing style for a specific recipient (domain or email)
 */
export function analyzeStyleForRecipient(
  userId: string,
  emails: EmailForAnalysis[],
  recipientPattern: string
): WritingStyle {
  // Filter emails to those matching the recipient pattern
  const filteredEmails = emails.filter((email) => {
    const allRecipients = [...email.to, ...(email.cc || [])];
    return allRecipients.some(
      (r) =>
        r.toLowerCase().includes(recipientPattern.toLowerCase()) ||
        r.toLowerCase().endsWith(recipientPattern.toLowerCase())
    );
  });

  const style = analyzeWritingStyle(userId, filteredEmails);
  style.recipientPattern = recipientPattern;

  return style;
}

/**
 * Get stored writing style for a user
 */
export async function getStoredStyle(
  userId: string,
  recipientPattern?: string
): Promise<WritingStyle | null> {
  try {
    const db = dbClient.getDb();

    const conditions = recipientPattern
      ? and(eq(writingStyles.userId, userId), eq(writingStyles.recipientPattern, recipientPattern))
      : and(eq(writingStyles.userId, userId), eq(writingStyles.recipientPattern, '__overall__'));

    const [stored] = await db.select().from(writingStyles).where(conditions).limit(1);

    if (!stored) return null;

    return {
      userId: stored.userId,
      recipientPattern: stored.recipientPattern === '__overall__' ? undefined : stored.recipientPattern || undefined,
      formality: stored.formality as 'formal' | 'casual' | 'mixed',
      averageSentenceLength: stored.averageSentenceLength,
      averageEmailLength: stored.averageEmailLength,
      commonGreetings: stored.commonGreetings || [],
      commonSignOffs: stored.commonSignOffs || [],
      responseTimeHours: stored.responseTimeHours,
      activeHours: stored.activeHours as { start: number; end: number },
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting stored style:`, error);
    return null;
  }
}

/**
 * Save writing style to database
 */
export async function saveWritingStyle(style: WritingStyle): Promise<void> {
  try {
    const db = dbClient.getDb();

    const data: NewWritingStyle = {
      userId: style.userId,
      recipientPattern: style.recipientPattern || '__overall__',
      formality: style.formality,
      averageSentenceLength: style.averageSentenceLength,
      averageEmailLength: style.averageEmailLength,
      commonGreetings: style.commonGreetings,
      commonSignOffs: style.commonSignOffs,
      responseTimeHours: style.responseTimeHours,
      activeHours: style.activeHours,
    };

    // Upsert: insert or update
    await db
      .insert(writingStyles)
      .values(data)
      .onConflictDoUpdate({
        target: [writingStyles.userId, writingStyles.recipientPattern],
        set: {
          formality: data.formality,
          averageSentenceLength: data.averageSentenceLength,
          averageEmailLength: data.averageEmailLength,
          commonGreetings: data.commonGreetings,
          commonSignOffs: data.commonSignOffs,
          responseTimeHours: data.responseTimeHours,
          activeHours: data.activeHours,
          analyzedAt: new Date(),
          emailsAnalyzed: 0, // TODO: Track this
        },
      });

    console.log(`${LOG_PREFIX} Saved writing style for user ${style.userId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error saving style:`, error);
    throw error;
  }
}

/**
 * Get user's overall writing style (retrieves from DB or returns default)
 */
export async function getOverallStyle(userId: string): Promise<WritingStyle> {
  const stored = await getStoredStyle(userId);

  if (stored) return stored;

  // Return default style
  return {
    userId,
    formality: 'mixed',
    averageSentenceLength: 15,
    averageEmailLength: 100,
    commonGreetings: ['hi', 'hello'],
    commonSignOffs: ['thanks', 'best'],
    responseTimeHours: 24,
    activeHours: { start: 9, end: 17 },
  };
}

/**
 * Get style for a specific recipient (falls back to overall style)
 */
export async function getStyleForRecipient(
  userId: string,
  recipientEmail: string
): Promise<WritingStyle> {
  // Try exact email match first
  let style = await getStoredStyle(userId, recipientEmail.toLowerCase());
  if (style) return style;

  // Try domain match
  const domain = '@' + recipientEmail.split('@')[1];
  style = await getStoredStyle(userId, domain.toLowerCase());
  if (style) return style;

  // Fall back to overall style
  return getOverallStyle(userId);
}

/**
 * Suggest draft style for a new email
 */
export async function suggestDraftStyle(
  userId: string,
  recipientEmail: string,
  context?: {
    isReply?: boolean;
    subject?: string;
    isUrgent?: boolean;
  }
): Promise<StyleSuggestion> {
  const style = await getStyleForRecipient(userId, recipientEmail);

  // Adjust formality based on context
  let suggestedFormality = style.formality;
  if (context?.isUrgent && suggestedFormality === 'casual') {
    suggestedFormality = 'mixed';
  }

  // Select greeting based on formality
  let suggestedGreeting = style.commonGreetings[0] || 'Hi';
  if (suggestedFormality === 'formal' && !FORMAL_GREETINGS.some((g) => suggestedGreeting.toLowerCase().startsWith(g))) {
    suggestedGreeting = 'Dear';
  }

  // Select sign-off based on formality
  let suggestedSignOff = style.commonSignOffs[0] || 'Best';
  if (suggestedFormality === 'formal' && !FORMAL_SIGNOFFS.some((s) => suggestedSignOff.toLowerCase().startsWith(s))) {
    suggestedSignOff = 'Best regards';
  }

  // Generate tone description
  const toneDescriptions = {
    formal: 'Professional and polished. Use complete sentences and proper titles.',
    casual: 'Friendly and conversational. Contractions and informal language are fine.',
    mixed: 'Professional but approachable. Balance formality with warmth.',
  };

  // Calculate confidence based on data availability
  const hasRecipientSpecificStyle = style.recipientPattern !== undefined;
  const hasGreetings = style.commonGreetings.length > 0;
  const hasSignOffs = style.commonSignOffs.length > 0;

  let confidence = 0.5; // Base confidence
  if (hasRecipientSpecificStyle) confidence += 0.2;
  if (hasGreetings) confidence += 0.15;
  if (hasSignOffs) confidence += 0.15;

  return {
    formality: suggestedFormality,
    suggestedGreeting,
    suggestedSignOff,
    toneDescription: toneDescriptions[suggestedFormality],
    averageLength: style.averageEmailLength,
    confidence: Math.min(1, confidence),
  };
}

// Export utility functions for testing
export { extractGreeting, extractSignOff, countWords, countSentences, determineFormality };
