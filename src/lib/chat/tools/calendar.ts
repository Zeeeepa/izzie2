/**
 * Google Calendar Chat Tools
 * MCP tools for interacting with Google Calendar API
 */

import { z } from 'zod';
import { google } from 'googleapis';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { CalendarService } from '@/lib/google/calendar';
import type { CalendarEvent } from '@/lib/google/types';

const LOG_PREFIX = '[Calendar Tools]';

/**
 * Initialize Calendar client for user
 */
async function getCalendarClient(userId: string): Promise<CalendarService> {
  const tokens = await getGoogleTokens(userId);
  if (!tokens) {
    throw new Error('No Google tokens found for user. Please connect your Google account.');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
      : 'http://localhost:3300/api/auth/callback/google'
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken || undefined,
    refresh_token: tokens.refreshToken || undefined,
    expiry_date: tokens.accessTokenExpiresAt
      ? new Date(tokens.accessTokenExpiresAt).getTime()
      : undefined,
  });

  // Auto-refresh tokens if needed
  oauth2Client.on('tokens', async (newTokens) => {
    console.log(`${LOG_PREFIX} Tokens refreshed for user:`, userId);
    await updateGoogleTokens(userId, newTokens);
  });

  return new CalendarService(oauth2Client);
}

/**
 * Format calendar event for user-friendly display
 */
function formatEvent(event: CalendarEvent): string {
  const lines: string[] = [];

  lines.push(`📅 **${event.summary}**`);
  lines.push(`   ID: ${event.id}`);

  // Start time
  const startDate = new Date(event.start.dateTime);
  const endDate = new Date(event.end.dateTime);
  lines.push(`   🕐 ${startDate.toLocaleString()} - ${endDate.toLocaleTimeString()}`);

  if (event.location) {
    lines.push(`   📍 ${event.location}`);
  }

  if (event.description) {
    const truncatedDesc = event.description.length > 100
      ? event.description.substring(0, 97) + '...'
      : event.description;
    lines.push(`   📝 ${truncatedDesc}`);
  }

  // Attendees
  if (event.attendees && event.attendees.length > 0) {
    const attendeeNames = event.attendees
      .slice(0, 3)
      .map(a => a.displayName || a.email)
      .join(', ');
    const moreCount = event.attendees.length > 3 ? ` +${event.attendees.length - 3} more` : '';
    lines.push(`   👥 ${attendeeNames}${moreCount}`);
  }

  // Organizer
  if (event.organizer) {
    lines.push(`   🎯 Organizer: ${event.organizer.displayName || event.organizer.email}`);
  }

  // Meeting link
  if (event.hangoutLink) {
    lines.push(`   🔗 ${event.hangoutLink}`);
  } else if (event.conferenceData?.entryPoints) {
    const videoEntry = event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video');
    if (videoEntry) {
      lines.push(`   🔗 ${videoEntry.uri}`);
    }
  }

  // Status
  if (event.status) {
    const statusEmoji = event.status === 'confirmed' ? '✅' : event.status === 'cancelled' ? '❌' : '⏳';
    lines.push(`   ${statusEmoji} Status: ${event.status}`);
  }

  return lines.join('\n');
}

/**
 * Format multiple events for display
 */
function formatEventsList(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return '📅 No events found.';
  }

  const formattedEvents = events.map(formatEvent).join('\n\n');
  return `📅 Found ${events.length} event(s):\n\n${formattedEvents}`;
}

// ===== LIST CALENDAR EVENTS TOOL =====

export const listCalendarEventsToolSchema = z.object({
  startDate: z
    .string()
    .optional()
    .describe('Start date for event range (ISO 8601 format, e.g., "2024-01-01T00:00:00Z"). Defaults to now.'),
  endDate: z
    .string()
    .optional()
    .describe('End date for event range (ISO 8601 format, e.g., "2024-12-31T23:59:59Z"). Defaults to 30 days from start.'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(250)
    .optional()
    .default(10)
    .describe('Maximum number of events to return (1-250). Default: 10.'),
  query: z
    .string()
    .optional()
    .describe('Search query to filter events by keywords in title, description, or location.'),
});

export type ListCalendarEventsParams = z.infer<typeof listCalendarEventsToolSchema>;

export const listCalendarEventsTool = {
  name: 'list_calendar_events',
  description: 'List calendar events from the user\'s primary Google Calendar with optional date range and search filtering.',
  parameters: listCalendarEventsToolSchema,
  async execute(params: ListCalendarEventsParams, userId: string): Promise<{ message: string }> {
    console.log(`${LOG_PREFIX} Listing calendar events for user ${userId}`, params);

    const validated = listCalendarEventsToolSchema.parse(params);

    // Parse date range
    const startDate = validated.startDate ? new Date(validated.startDate) : new Date();
    const endDate = validated.endDate
      ? new Date(validated.endDate)
      : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from start

    // Validate dates
    if (isNaN(startDate.getTime())) {
      throw new Error('Invalid startDate format. Use ISO 8601 format (e.g., "2024-01-01T00:00:00Z").');
    }
    if (isNaN(endDate.getTime())) {
      throw new Error('Invalid endDate format. Use ISO 8601 format (e.g., "2024-12-31T23:59:59Z").');
    }
    if (endDate <= startDate) {
      throw new Error('endDate must be after startDate.');
    }

    const calendarClient = await getCalendarClient(userId);

    const result = await calendarClient.fetchEvents({
      timeMin: startDate,
      timeMax: endDate,
      maxResults: validated.maxResults,
    });

    let events = result.events;

    // Apply query filtering if provided
    if (validated.query) {
      const queryLower = validated.query.toLowerCase();
      events = events.filter((event) => {
        const summary = event.summary?.toLowerCase() || '';
        const description = event.description?.toLowerCase() || '';
        const location = event.location?.toLowerCase() || '';
        return (
          summary.includes(queryLower) ||
          description.includes(queryLower) ||
          location.includes(queryLower)
        );
      });
    }

    console.log(`${LOG_PREFIX} Found ${events.length} events`);

    return {
      message: formatEventsList(events),
    };
  },
};

// ===== GET CALENDAR EVENT TOOL =====

export const getCalendarEventToolSchema = z.object({
  eventId: z.string().describe('The unique ID of the calendar event to retrieve.'),
});

export type GetCalendarEventParams = z.infer<typeof getCalendarEventToolSchema>;

export const getCalendarEventTool = {
  name: 'get_calendar_event',
  description: 'Get detailed information about a specific calendar event by ID.',
  parameters: getCalendarEventToolSchema,
  async execute(params: GetCalendarEventParams, userId: string): Promise<{ message: string }> {
    console.log(`${LOG_PREFIX} Getting calendar event for user ${userId}`, params);

    const validated = getCalendarEventToolSchema.parse(params);

    const calendarClient = await getCalendarClient(userId);

    const event = await calendarClient.getEvent(validated.eventId);

    if (!event) {
      return {
        message: `❌ Event not found with ID: ${validated.eventId}`,
      };
    }

    console.log(`${LOG_PREFIX} Found event: ${event.summary}`);

    return {
      message: formatEvent(event),
    };
  },
};

// ===== SEARCH CALENDAR EVENTS TOOL =====

export const searchCalendarEventsToolSchema = z.object({
  query: z.string().describe('Search keywords to find in event titles, descriptions, or locations.'),
  startDate: z
    .string()
    .optional()
    .describe('Start date for search range (ISO 8601 format). Defaults to 30 days ago.'),
  endDate: z
    .string()
    .optional()
    .describe('End date for search range (ISO 8601 format). Defaults to 90 days from now.'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(250)
    .optional()
    .default(25)
    .describe('Maximum number of matching events to return (1-250). Default: 25.'),
});

export type SearchCalendarEventsParams = z.infer<typeof searchCalendarEventsToolSchema>;

export const searchCalendarEventsTool = {
  name: 'search_calendar_events',
  description: 'Search calendar events by keywords in title, description, or location with optional date filtering.',
  parameters: searchCalendarEventsToolSchema,
  async execute(params: SearchCalendarEventsParams, userId: string): Promise<{ message: string }> {
    console.log(`${LOG_PREFIX} Searching calendar events for user ${userId}`, params);

    const validated = searchCalendarEventsToolSchema.parse(params);

    // Parse date range with sensible defaults for searching
    const now = new Date();
    const startDate = validated.startDate
      ? new Date(validated.startDate)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const endDate = validated.endDate
      ? new Date(validated.endDate)
      : new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days from now

    // Validate dates
    if (isNaN(startDate.getTime())) {
      throw new Error('Invalid startDate format. Use ISO 8601 format (e.g., "2024-01-01T00:00:00Z").');
    }
    if (isNaN(endDate.getTime())) {
      throw new Error('Invalid endDate format. Use ISO 8601 format (e.g., "2024-12-31T23:59:59Z").');
    }
    if (endDate <= startDate) {
      throw new Error('endDate must be after startDate.');
    }

    const calendarClient = await getCalendarClient(userId);

    const result = await calendarClient.fetchEvents({
      timeMin: startDate,
      timeMax: endDate,
      maxResults: validated.maxResults,
    });

    // Filter by query
    const queryLower = validated.query.toLowerCase();
    const matchingEvents = result.events.filter((event) => {
      const summary = event.summary?.toLowerCase() || '';
      const description = event.description?.toLowerCase() || '';
      const location = event.location?.toLowerCase() || '';
      return (
        summary.includes(queryLower) ||
        description.includes(queryLower) ||
        location.includes(queryLower)
      );
    });

    console.log(`${LOG_PREFIX} Found ${matchingEvents.length} matching events for query: "${validated.query}"`);

    if (matchingEvents.length === 0) {
      return {
        message: `🔍 No events found matching "${validated.query}" between ${startDate.toLocaleDateString()} and ${endDate.toLocaleDateString()}.`,
      };
    }

    return {
      message: `🔍 Search results for "${validated.query}":\n\n${formatEventsList(matchingEvents)}`,
    };
  },
};
