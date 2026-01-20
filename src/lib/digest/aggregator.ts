/**
 * Digest Aggregator
 *
 * Core digest generation logic that:
 * 1. Fetches emails via GmailService and events via CalendarService
 * 2. Scores items using EmailScorer and CalendarScorer
 * 3. Filters 80%+ relevance items for topPriority section
 * 4. Organizes into sections per DigestContent type
 */

import { google } from 'googleapis';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { GmailService } from '@/lib/google/gmail';
import { CalendarService } from '@/lib/google/calendar';
import { EmailScorer, CalendarScorer } from '@/lib/scoring';
import type { Email, CalendarEvent } from '@/lib/google/types';
import type { SignificanceScore, CalendarEventScore } from '@/lib/scoring';
import type {
  DigestContent,
  DigestItem,
  DigestType,
  DigestUrgency,
  DigestStats,
  DigestItemSource,
} from './types';

/** Relevance threshold for top priority items (80%) */
const TOP_PRIORITY_THRESHOLD = 80;

/** High relevance threshold for needs attention (60%) */
const NEEDS_ATTENTION_THRESHOLD = 60;

/** Minimum threshold for inclusion in digest (30%) */
const MINIMUM_INCLUSION_THRESHOLD = 30;

/** Default timezone if user timezone not available */
const DEFAULT_TIMEZONE = 'America/Los_Angeles';

/** Hours to look ahead for events in morning digest */
const MORNING_LOOKAHEAD_HOURS = 16;

/** Hours to look ahead for events in evening digest */
const EVENING_LOOKAHEAD_HOURS = 24;

/** Hours to look back for recent emails */
const EMAIL_LOOKBACK_HOURS = 24;

interface AggregatorOptions {
  /** User's timezone (IANA identifier) */
  timezone?: string;
  /** Override email lookback period (hours) */
  emailLookbackHours?: number;
  /** Maximum emails to fetch */
  maxEmails?: number;
  /** Maximum events to fetch */
  maxEvents?: number;
}

interface ScoredEmail {
  email: Email;
  score: SignificanceScore;
}

interface ScoredEvent {
  event: CalendarEvent;
  score: CalendarEventScore;
}

/**
 * Generate a digest for a user
 */
export async function generateDigest(
  userId: string,
  digestType: DigestType,
  options: AggregatorOptions = {}
): Promise<DigestContent> {
  const startTime = Date.now();
  const {
    timezone = DEFAULT_TIMEZONE,
    emailLookbackHours = EMAIL_LOOKBACK_HOURS,
    maxEmails = 100,
    maxEvents = 50,
  } = options;

  // Create OAuth2 client with user tokens
  const oauth2Client = await createOAuth2Client(userId);

  // Initialize services
  const gmailService = new GmailService(oauth2Client);
  const calendarService = new CalendarService(oauth2Client);

  // Fetch data in parallel
  const now = new Date();
  const [emails, events] = await Promise.all([
    fetchRecentEmails(gmailService, emailLookbackHours, maxEmails),
    fetchUpcomingEvents(calendarService, digestType, maxEvents, now),
  ]);

  // Score items
  const scoredEmails = scoreEmails(emails, userId);
  const scoredEvents = scoreEvents(events, now);

  // Organize into sections
  const sections = organizeSections(scoredEmails, scoredEvents, digestType, now);

  // Calculate statistics
  const stats = calculateStats(emails, events, sections, startTime);

  return {
    userId,
    digestType,
    generatedAt: now.toISOString(),
    timezone,
    sections,
    stats,
  };
}

/**
 * Create OAuth2 client with user's tokens
 */
async function createOAuth2Client(userId: string) {
  const tokens = await getGoogleTokens(userId);

  if (!tokens) {
    throw new Error(`No Google tokens found for user ${userId}`);
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken || undefined,
    refresh_token: tokens.refreshToken || undefined,
    expiry_date: tokens.accessTokenExpiresAt?.getTime(),
  });

  // Handle token refresh
  oauth2Client.on('tokens', async (newTokens) => {
    await updateGoogleTokens(userId, newTokens);
  });

  return oauth2Client;
}

/**
 * Fetch recent emails
 */
async function fetchRecentEmails(
  gmailService: GmailService,
  lookbackHours: number,
  maxResults: number
): Promise<Email[]> {
  const since = new Date();
  since.setHours(since.getHours() - lookbackHours);

  try {
    const batch = await gmailService.fetchEmails({
      folder: 'inbox',
      maxResults,
      since,
      excludePromotions: true,
      excludeSocial: true,
    });

    return batch.emails;
  } catch (error) {
    console.error('[Digest] Failed to fetch emails:', error);
    return [];
  }
}

/**
 * Fetch upcoming events based on digest type
 */
async function fetchUpcomingEvents(
  calendarService: CalendarService,
  digestType: DigestType,
  maxResults: number,
  now: Date
): Promise<CalendarEvent[]> {
  const lookaheadHours =
    digestType === 'morning' ? MORNING_LOOKAHEAD_HOURS : EVENING_LOOKAHEAD_HOURS;

  const timeMin = now;
  const timeMax = new Date(now.getTime() + lookaheadHours * 60 * 60 * 1000);

  try {
    const result = await calendarService.fetchEvents({
      timeMin,
      timeMax,
      maxResults,
    });

    return result.events;
  } catch (error) {
    console.error('[Digest] Failed to fetch events:', error);
    return [];
  }
}

/**
 * Score emails using EmailScorer
 */
function scoreEmails(emails: Email[], userEmail: string): ScoredEmail[] {
  const scorer = new EmailScorer();
  const scores = scorer.scoreBatch(emails, userEmail);

  return emails.map((email, i) => ({
    email,
    score: scores[i],
  }));
}

/**
 * Score events using CalendarScorer
 */
function scoreEvents(events: CalendarEvent[], referenceTime: Date): ScoredEvent[] {
  const scorer = new CalendarScorer();
  const scores = scorer.scoreBatch(events, referenceTime);

  return events.map((event, i) => ({
    event,
    score: scores[i],
  }));
}

/**
 * Organize scored items into digest sections
 */
function organizeSections(
  scoredEmails: ScoredEmail[],
  scoredEvents: ScoredEvent[],
  digestType: DigestType,
  now: Date
): DigestContent['sections'] {
  const topPriority: DigestItem[] = [];
  const upcoming: DigestItem[] = [];
  const needsAttention: DigestItem[] = [];
  const informational: DigestItem[] = [];

  // Process emails
  for (const { email, score } of scoredEmails) {
    if (score.score < MINIMUM_INCLUSION_THRESHOLD) continue;

    const item = emailToDigestItem(email, score);

    if (score.score >= TOP_PRIORITY_THRESHOLD) {
      topPriority.push(item);
    } else if (score.score >= NEEDS_ATTENTION_THRESHOLD) {
      needsAttention.push(item);
    } else {
      informational.push(item);
    }
  }

  // Process events
  for (const { event, score } of scoredEvents) {
    if (score.score < MINIMUM_INCLUSION_THRESHOLD) continue;

    const item = eventToDigestItem(event, score, now);

    // Events within next 4 hours go to upcoming
    const eventStart = new Date(event.start.dateTime);
    const hoursUntil = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntil <= 4) {
      upcoming.push(item);
    } else if (score.score >= TOP_PRIORITY_THRESHOLD) {
      topPriority.push(item);
    } else if (score.score >= NEEDS_ATTENTION_THRESHOLD) {
      needsAttention.push(item);
    } else {
      informational.push(item);
    }
  }

  // Sort each section by relevance score
  const sortByScore = (a: DigestItem, b: DigestItem) => b.relevanceScore - a.relevanceScore;

  return {
    topPriority: topPriority.sort(sortByScore),
    upcoming: upcoming.sort((a, b) => {
      // Sort upcoming by timestamp (chronological)
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    }),
    needsAttention: needsAttention.sort(sortByScore),
    informational: informational.sort(sortByScore),
  };
}

/**
 * Convert email to DigestItem
 */
function emailToDigestItem(email: Email, score: SignificanceScore): DigestItem {
  const urgency = determineEmailUrgency(email, score);

  return {
    id: email.id,
    type: email.isSent ? 'sent_email' : 'received_email',
    title: email.subject,
    summary: email.snippet || email.body.slice(0, 150) + (email.body.length > 150 ? '...' : ''),
    relevanceScore: score.score,
    urgency,
    actionable: !email.isSent && urgency !== 'low',
    source: 'email' as DigestItemSource,
    timestamp: email.date.toISOString(),
    metadata: {
      from: email.from,
      to: email.to,
      threadId: email.threadId,
      hasAttachments: email.hasAttachments,
      labels: email.labels,
      scoringFactors: score.factors,
    },
  };
}

/**
 * Convert event to DigestItem
 */
function eventToDigestItem(event: CalendarEvent, score: CalendarEventScore, now: Date): DigestItem {
  const urgency = determineEventUrgency(event, now);
  const eventStart = new Date(event.start.dateTime);

  return {
    id: event.id,
    type: event.attendees.length > 0 ? 'meeting' : 'event',
    title: event.summary,
    summary: buildEventSummary(event, now),
    relevanceScore: score.score,
    urgency,
    actionable: event.attendees.some((a) => a.self && a.responseStatus === 'needsAction'),
    source: 'calendar' as DigestItemSource,
    timestamp: eventStart.toISOString(),
    metadata: {
      location: event.location,
      attendees: event.attendees,
      organizer: event.organizer,
      htmlLink: event.htmlLink,
      recurringEventId: event.recurringEventId,
      scoringFactors: score.factors,
    },
  };
}

/**
 * Determine urgency level for email
 */
function determineEmailUrgency(email: Email, score: SignificanceScore): DigestUrgency {
  if (email.labels.includes('STARRED')) return 'high';
  if (email.labels.includes('IMPORTANT')) return 'medium';

  if (score.score >= 90) return 'critical';
  if (score.score >= 70) return 'high';
  if (score.score >= 50) return 'medium';
  return 'low';
}

/**
 * Determine urgency level for event
 */
function determineEventUrgency(event: CalendarEvent, now: Date): DigestUrgency {
  const eventStart = new Date(event.start.dateTime);
  const hoursUntil = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Currently happening or starting very soon
  if (hoursUntil <= 0.5) return 'critical';

  // Within next hour
  if (hoursUntil <= 1) return 'high';

  // Within next 4 hours
  if (hoursUntil <= 4) return 'medium';

  return 'low';
}

/**
 * Build human-readable event summary
 */
function buildEventSummary(event: CalendarEvent, now: Date): string {
  const eventStart = new Date(event.start.dateTime);
  const hoursUntil = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  let timePart: string;
  if (hoursUntil < 0) {
    timePart = 'Now';
  } else if (hoursUntil < 1) {
    const minutes = Math.round(hoursUntil * 60);
    timePart = `In ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (hoursUntil < 24) {
    const hours = Math.round(hoursUntil);
    timePart = `In ${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    timePart = eventStart.toLocaleDateString();
  }

  const parts = [timePart];

  if (event.location) {
    parts.push(`at ${event.location}`);
  }

  if (event.attendees.length > 0) {
    const otherAttendees = event.attendees.filter((a) => !a.self);
    if (otherAttendees.length === 1) {
      parts.push(`with ${otherAttendees[0].displayName || otherAttendees[0].email}`);
    } else if (otherAttendees.length > 1) {
      parts.push(`with ${otherAttendees.length} attendees`);
    }
  }

  return parts.join(' ');
}

/**
 * Calculate digest generation statistics
 */
function calculateStats(
  emails: Email[],
  events: CalendarEvent[],
  sections: DigestContent['sections'],
  startTime: number
): DigestStats {
  const allItems = [
    ...sections.topPriority,
    ...sections.upcoming,
    ...sections.needsAttention,
    ...sections.informational,
  ];

  const bySource: Record<DigestItemSource, number> = {
    email: 0,
    calendar: 0,
    task: 0,
    drive: 0,
    notification: 0,
  };

  const byUrgency: Record<DigestUrgency, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const item of allItems) {
    bySource[item.source]++;
    byUrgency[item.urgency]++;
  }

  return {
    totalItemsConsidered: emails.length + events.length,
    itemsIncluded: allItems.length,
    itemsFilteredByRelevance: emails.length + events.length - allItems.length,
    bySource,
    byUrgency,
    generationTimeMs: Date.now() - startTime,
  };
}
