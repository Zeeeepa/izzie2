/**
 * Calendar Source for Research Agent
 * Searches calendar events using CalendarService
 */

import { CalendarService } from '@/lib/google/calendar';
import type { Auth } from 'googleapis';
import type { ResearchSourceResult } from '../types';
import type { CalendarEvent } from '@/lib/google/types';

const MAX_RESULTS_DEFAULT = 5;

export interface CalendarSearchOptions {
  maxResults?: number;
  timeRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Search calendar events by query keywords
 * Returns top results with unified ResearchSourceResult format
 */
export async function searchCalendarEvents(
  auth: Auth.GoogleAuth | Auth.OAuth2Client,
  query: string,
  options: CalendarSearchOptions = {}
): Promise<ResearchSourceResult[]> {
  const {
    maxResults = MAX_RESULTS_DEFAULT,
    timeRange = getDefaultTimeRange(),
  } = options;

  const calendarService = new CalendarService(auth);

  try {
    // Extract keywords from query for client-side filtering
    const keywords = extractKeywords(query);

    // Fetch events in time range
    const { events } = await calendarService.fetchEvents({
      timeMin: timeRange.start,
      timeMax: timeRange.end,
      maxResults: maxResults * 3, // Fetch more to allow filtering
    });

    // Filter events by keywords (search summary, description, location, attendees)
    const filteredEvents = events.filter((event) =>
      matchesKeywords(event, keywords)
    );

    // Take top matches
    const topEvents = filteredEvents.slice(0, maxResults);

    // Convert to unified format
    const results: ResearchSourceResult[] = topEvents.map((event) =>
      calendarEventToResearchResult(event)
    );

    console.log(
      `[CalendarSource] Found ${results.length} calendar events matching "${query}" (keywords: ${keywords.join(', ')})`
    );

    return results;
  } catch (error) {
    console.error('[CalendarSource] Failed to search calendar events:', error);
    return [];
  }
}

/**
 * Get default time range for calendar search
 * Searches past 3 months + future 6 months (9 months total)
 */
function getDefaultTimeRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 3); // 3 months ago

  const end = new Date(now);
  end.setMonth(end.getMonth() + 6); // 6 months from now

  return { start, end };
}

/**
 * Extract meaningful keywords from search query
 * Filters out stop words and short words
 */
function extractKeywords(query: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'from', 'by', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'can', 'could', 'may', 'might', 'must', 'this', 'that', 'these', 'those',
  ]);

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .filter(Boolean);
}

/**
 * Check if event matches keywords
 * Searches: summary, description, location, attendee names/emails
 */
function matchesKeywords(event: CalendarEvent, keywords: string[]): boolean {
  if (keywords.length === 0) return true;

  const searchableText = [
    event.summary.toLowerCase(),
    event.description?.toLowerCase() || '',
    event.location?.toLowerCase() || '',
    ...event.attendees.map(a => a.displayName.toLowerCase()),
    ...event.attendees.map(a => a.email.toLowerCase()),
  ].join(' ');

  // Match if ANY keyword is found
  return keywords.some(keyword => searchableText.includes(keyword));
}

/**
 * Convert CalendarEvent to ResearchSourceResult
 */
function calendarEventToResearchResult(event: CalendarEvent): ResearchSourceResult {
  const startDate = new Date(event.start.dateTime);
  const dateStr = startDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  // Build snippet from description and attendees
  const attendeeNames = event.attendees
    .slice(0, 3)
    .map(a => a.displayName)
    .join(', ');
  const moreAttendees = event.attendees.length > 3
    ? ` +${event.attendees.length - 3} more`
    : '';

  const snippetParts: string[] = [];
  if (event.description) {
    snippetParts.push(truncateText(event.description, 100));
  }
  if (attendeeNames) {
    snippetParts.push(`Attendees: ${attendeeNames}${moreAttendees}`);
  }
  if (event.location) {
    snippetParts.push(`Location: ${event.location}`);
  }

  return {
    sourceType: 'calendar',
    title: event.summary,
    snippet: snippetParts.join(' • ') || 'No description',
    link: event.id,
    reference: `Calendar event on ${dateStr} at ${timeStr}`,
    date: startDate,
    metadata: {
      eventId: event.id,
      location: event.location,
      start: event.start,
      end: event.end,
      attendees: event.attendees,
      organizer: event.organizer,
      status: event.status,
      htmlLink: event.htmlLink,
      hangoutLink: event.hangoutLink,
      conferenceData: event.conferenceData,
    },
  };
}

/**
 * Truncate text to specified length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
