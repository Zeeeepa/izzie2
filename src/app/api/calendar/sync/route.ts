/**
 * Google Calendar Sync API Endpoint
 * Triggers calendar event synchronization from Google Calendar
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceAccountAuth } from '@/lib/google/auth';
import { getCalendarService } from '@/lib/google/calendar';
import type { SyncStatus } from '@/lib/google/types';
import { inngest } from '@/lib/events';
import type { CalendarEventExtractedPayload } from '@/lib/events/types';
import {
  updateCounters,
  completeExtraction,
  markExtractionError,
} from '@/lib/extraction/progress';

// In-memory sync status (in production, use Redis or database)
let syncStatus: SyncStatus & { eventsSent?: number } = {
  isRunning: false,
  emailsProcessed: 0,
  eventsSent: 0,
};

/**
 * POST /api/calendar/sync
 * Start calendar event synchronization
 */
export async function POST(request: NextRequest) {
  try {
    // Check if sync is already running
    if (syncStatus.isRunning) {
      return NextResponse.json(
        {
          error: 'Sync already in progress',
          status: syncStatus,
        },
        { status: 409 }
      );
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const {
      maxResults = 100,
      daysPast = 30,
      daysFuture = 30,
      userEmail,
    } = body;

    // Start sync (don't await - run in background)
    startSync(maxResults, daysPast, daysFuture, userEmail).catch((error) => {
      console.error('[Calendar Sync] Background sync failed:', error);
      syncStatus.isRunning = false;
      syncStatus.error = error.message;
    });

    return NextResponse.json({
      message: 'Calendar sync started',
      status: syncStatus,
    });
  } catch (error) {
    console.error('[Calendar Sync] Failed to start sync:', error);
    return NextResponse.json(
      { error: `Failed to start sync: ${error}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/calendar/sync
 * Get sync status
 */
export async function GET() {
  return NextResponse.json({
    status: syncStatus,
  });
}

/**
 * Background sync function
 */
async function startSync(
  maxResults: number,
  daysPast: number,
  daysFuture: number,
  userEmail?: string
): Promise<void> {
  syncStatus = {
    isRunning: true,
    emailsProcessed: 0,
    eventsSent: 0,
    lastSync: new Date(),
  };

  const userId = userEmail || 'default';

  try {
    // Get authentication
    const auth = await getServiceAccountAuth(userEmail);
    const calendarService = await getCalendarService(auth);

    // Calculate time range
    const timeMin = new Date(Date.now() - daysPast * 24 * 60 * 60 * 1000);
    const timeMax = new Date(Date.now() + daysFuture * 24 * 60 * 60 * 1000);

    console.log(`[Calendar Sync] Fetching events from ${timeMin.toISOString()} to ${timeMax.toISOString()}`);

    // Fetch calendar events with pagination
    let pageToken: string | undefined;
    let totalProcessed = 0;

    do {
      const batch = await calendarService.fetchEvents({
        timeMin,
        timeMax,
        maxResults: Math.min(maxResults - totalProcessed, 100),
        pageToken,
      });

      totalProcessed += batch.events.length;
      syncStatus.emailsProcessed = totalProcessed; // Reuse field for event count

      // Update extraction progress table
      await updateCounters(userId, 'calendar', {
        totalItems: totalProcessed,
        processedItems: totalProcessed,
      });

      // Emit events for entity extraction (batch send for efficiency)
      if (batch.events.length > 0) {
        const events = batch.events.map((event) => ({
          name: 'izzie/ingestion.calendar.extracted' as const,
          data: {
            userId: userEmail || 'default',
            eventId: event.id,
            summary: event.summary,
            description: event.description || '',
            location: event.location,
            start: event.start,
            end: event.end,
            attendees: event.attendees || [],
            organizer: event.organizer,
            recurringEventId: event.recurringEventId,
            status: event.status,
            htmlLink: event.htmlLink,
          } satisfies CalendarEventExtractedPayload,
        }));

        await inngest.send(events);
        syncStatus.eventsSent = (syncStatus.eventsSent || 0) + events.length;
        console.log(`[Calendar Sync] Sent ${events.length} events for entity extraction`);
      }

      pageToken = batch.nextPageToken;

      // Stop if we've reached max results
      if (totalProcessed >= maxResults) {
        break;
      }
    } while (pageToken);

    syncStatus.isRunning = false;
    syncStatus.lastSync = new Date();

    // Mark extraction as completed in database
    await completeExtraction(userId, 'calendar', {
      oldestDate: timeMin,
      newestDate: timeMax,
    });

    console.log(
      `[Calendar Sync] Completed. Processed ${totalProcessed} calendar events, sent ${syncStatus.eventsSent} events for extraction`
    );
  } catch (error) {
    console.error('[Calendar Sync] Sync failed:', error);
    syncStatus.isRunning = false;
    syncStatus.error = error instanceof Error ? error.message : 'Unknown error';

    // Mark extraction as error in database
    await markExtractionError(userId, 'calendar');

    throw error;
  }
}
