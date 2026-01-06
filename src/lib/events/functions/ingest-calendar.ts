/**
 * Calendar Event Ingestion Function
 * Scheduled function that fetches calendar events and emits events for processing
 */

import { inngest } from '../index';
import { CalendarService } from '@/lib/google/calendar';
import { getServiceAccountAuth } from '@/lib/google/auth';
import {
  getSyncState,
  updateSyncState,
  incrementProcessedCount,
  recordSyncError,
} from '@/lib/ingestion/sync-state';
import type { CalendarEventExtractedPayload } from '../types';

const LOG_PREFIX = '[IngestCalendar]';

/**
 * Calendar ingestion function
 * Runs every 6 hours to fetch upcoming calendar events
 */
export const ingestCalendar = inngest.createFunction(
  {
    id: 'ingest-calendar',
    name: 'Ingest Calendar Events',
    retries: 3,
  },
  { cron: '0 */6 * * *' }, // Run every 6 hours
  async ({ step }) => {
    const userId = process.env.DEFAULT_USER_ID || 'default';

    console.log(`${LOG_PREFIX} Starting calendar event ingestion for user ${userId}`);

    // Step 1: Get sync state
    const syncState = await step.run('get-sync-state', async () => {
      const state = await getSyncState(userId, 'calendar');
      console.log(`${LOG_PREFIX} Current sync state:`, {
        lastSyncTime: state?.lastSyncTime,
        itemsProcessed: state?.itemsProcessed,
      });
      return state;
    });

    // Step 2: Fetch calendar events
    const eventBatch = await step.run('fetch-calendar-events', async () => {
      try {
        // Get Calendar service with service account
        const auth = await getServiceAccountAuth(userId);
        const calendarService = new CalendarService(auth);

        // Fetch events from 30 days ago to 60 days in future
        const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

        console.log(
          `${LOG_PREFIX} Fetching events from ${timeMin.toISOString()} to ${timeMax.toISOString()}`
        );

        // Fetch events
        const batch = await calendarService.fetchEvents({
          timeMin,
          timeMax,
          maxResults: 100,
        });

        console.log(`${LOG_PREFIX} Fetched ${batch.events.length} calendar events`);

        return batch;
      } catch (error) {
        console.error(`${LOG_PREFIX} Error fetching calendar events:`, error);
        await recordSyncError(userId, 'calendar', error as Error);
        throw error;
      }
    });

    // Step 3: Emit events for each calendar event
    const eventsEmitted = await step.run('emit-calendar-events', async () => {
      let count = 0;

      for (const event of eventBatch.events) {
        try {
          // Emit event for entity extraction
          await inngest.send({
            name: 'izzie/ingestion.calendar.extracted',
            data: {
              userId,
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
          });

          count++;

          // Update processed count every 10 events
          if (count % 10 === 0) {
            await incrementProcessedCount(userId, 'calendar', 10);
          }
        } catch (error) {
          console.error(`${LOG_PREFIX} Error emitting event for ${event.id}:`, error);
          // Continue with other events
        }
      }

      // Update final count
      if (count % 10 !== 0) {
        await incrementProcessedCount(userId, 'calendar', count % 10);
      }

      console.log(`${LOG_PREFIX} Emitted ${count} calendar events`);

      return count;
    });

    // Step 4: Update sync state
    await step.run('update-sync-state', async () => {
      await updateSyncState(userId, 'calendar', {
        lastSyncTime: new Date(),
      });

      console.log(`${LOG_PREFIX} Updated sync state`);
    });

    return {
      userId,
      eventsProcessed: eventsEmitted,
      nextPageToken: eventBatch.nextPageToken,
      completedAt: new Date().toISOString(),
    };
  }
);
