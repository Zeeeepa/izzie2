/**
 * Conflict Detection Tests
 * Comprehensive test suite for calendar conflict detection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkConflicts } from '@/lib/calendar/conflicts';
import type {
  CalendarEvent,
  EventTime,
  ConflictCheckRequest,
  ConflictSeverity,
} from '@/lib/calendar/types';
import * as calendarService from '@/lib/calendar/index';

// Mock calendar service functions
vi.mock('@/lib/calendar/index', () => ({
  listEvents: vi.fn(),
  listCalendars: vi.fn(),
}));

// Helper to create EventTime
function createEventTime(dateTime: string, timeZone?: string): EventTime {
  return {
    dateTime,
    timeZone: timeZone || 'America/Los_Angeles',
  };
}

// Helper to create all-day EventTime
function createAllDayEventTime(date: string): EventTime {
  return {
    date,
  };
}

// Helper to create a calendar event
function createEvent(
  id: string,
  summary: string,
  start: EventTime,
  end: EventTime,
  options?: {
    status?: 'confirmed' | 'tentative' | 'cancelled';
    transparency?: 'opaque' | 'transparent';
    recurringEventId?: string;
    recurrence?: string[];
  }
): CalendarEvent {
  return {
    id,
    calendarId: 'primary',
    summary,
    start,
    end,
    status: options?.status || 'confirmed',
    transparency: options?.transparency,
    recurringEventId: options?.recurringEventId,
    recurrence: options?.recurrence,
  };
}

describe('Conflict Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: return empty calendars and events
    vi.mocked(calendarService.listCalendars).mockResolvedValue({
      calendars: [
        {
          id: 'primary',
          summary: 'Primary Calendar',
          accessRole: 'owner',
        },
      ],
      nextPageToken: undefined,
      nextSyncToken: undefined,
    });

    vi.mocked(calendarService.listEvents).mockResolvedValue({
      events: [],
      nextPageToken: undefined,
      nextSyncToken: undefined,
    });
  });

  describe('Basic Conflict Detection', () => {
    it('should detect no conflicts when calendar is empty', async () => {
      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:00:00-08:00'),
        end: createEventTime('2025-01-06T15:00:00-08:00'),
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(false);
      expect(result.severity).toBe('none');
      expect(result.conflicts).toHaveLength(0);
    });

    it('should detect direct overlap conflict', async () => {
      const existingEvent = createEvent(
        'event-1',
        'Existing Meeting',
        createEventTime('2025-01-06T14:00:00-08:00'),
        createEventTime('2025-01-06T15:00:00-08:00')
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [existingEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:30:00-08:00'),
        end: createEventTime('2025-01-06T15:30:00-08:00'),
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(true);
      expect(result.severity).toBe('error');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe('direct_overlap');
      expect(result.conflicts[0].conflictingEvent.id).toBe('event-1');
      expect(result.conflicts[0].overlapDuration).toBe(30); // 30 minutes overlap
    });

    it('should detect double-booking (exact same time)', async () => {
      const existingEvent = createEvent(
        'event-1',
        'Existing Meeting',
        createEventTime('2025-01-06T14:00:00-08:00'),
        createEventTime('2025-01-06T15:00:00-08:00')
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [existingEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:00:00-08:00'),
        end: createEventTime('2025-01-06T15:00:00-08:00'),
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(true);
      expect(result.severity).toBe('error');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe('double_booking');
    });

    it('should not detect conflict for adjacent events without buffer', async () => {
      const existingEvent = createEvent(
        'event-1',
        'Existing Meeting',
        createEventTime('2025-01-06T14:00:00-08:00'),
        createEventTime('2025-01-06T15:00:00-08:00')
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [existingEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T15:00:00-08:00'),
        end: createEventTime('2025-01-06T16:00:00-08:00'),
        bufferMinutes: 0,
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(false);
      expect(result.severity).toBe('none');
    });
  });

  describe('Buffer Time Handling', () => {
    it('should detect back-to-back conflict with buffer time', async () => {
      const existingEvent = createEvent(
        'event-1',
        'Existing Meeting',
        createEventTime('2025-01-06T14:00:00-08:00'),
        createEventTime('2025-01-06T15:00:00-08:00')
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [existingEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T15:00:00-08:00'),
        end: createEventTime('2025-01-06T16:00:00-08:00'),
        bufferMinutes: 15,
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe('back_to_back');
    });

    it('should not detect conflict with sufficient buffer time', async () => {
      const existingEvent = createEvent(
        'event-1',
        'Existing Meeting',
        createEventTime('2025-01-06T14:00:00-08:00'),
        createEventTime('2025-01-06T15:00:00-08:00')
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [existingEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T15:20:00-08:00'),
        end: createEventTime('2025-01-06T16:00:00-08:00'),
        bufferMinutes: 15,
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(false);
      expect(result.severity).toBe('none');
    });
  });

  describe('Event Exclusion', () => {
    it('should exclude specified event from conflict detection', async () => {
      const existingEvent = createEvent(
        'event-1',
        'Existing Meeting',
        createEventTime('2025-01-06T14:00:00-08:00'),
        createEventTime('2025-01-06T15:00:00-08:00')
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [existingEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:00:00-08:00'),
        end: createEventTime('2025-01-06T15:00:00-08:00'),
        excludeEventId: 'event-1',
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(false);
      expect(result.severity).toBe('none');
    });
  });

  describe('Event Status Handling', () => {
    it('should skip cancelled events', async () => {
      const cancelledEvent = createEvent(
        'event-1',
        'Cancelled Meeting',
        createEventTime('2025-01-06T14:00:00-08:00'),
        createEventTime('2025-01-06T15:00:00-08:00'),
        { status: 'cancelled' }
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [cancelledEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:30:00-08:00'),
        end: createEventTime('2025-01-06T15:30:00-08:00'),
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(false);
      expect(result.severity).toBe('none');
    });

    it('should skip transparent (free) events', async () => {
      const transparentEvent = createEvent(
        'event-1',
        'Transparent Event',
        createEventTime('2025-01-06T14:00:00-08:00'),
        createEventTime('2025-01-06T15:00:00-08:00'),
        { transparency: 'transparent' }
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [transparentEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:30:00-08:00'),
        end: createEventTime('2025-01-06T15:30:00-08:00'),
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(false);
      expect(result.severity).toBe('none');
    });
  });

  describe('All-Day Events', () => {
    it('should detect conflict with all-day event', async () => {
      const allDayEvent = createEvent(
        'event-1',
        'All Day Event',
        createAllDayEventTime('2025-01-06'),
        createAllDayEventTime('2025-01-07')
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [allDayEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:00:00-08:00'),
        end: createEventTime('2025-01-06T15:00:00-08:00'),
        checkAllDayEvents: true,
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
    });

    it('should skip all-day events when checkAllDayEvents is false', async () => {
      const allDayEvent = createEvent(
        'event-1',
        'All Day Event',
        createAllDayEventTime('2025-01-06'),
        createAllDayEventTime('2025-01-07')
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [allDayEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:00:00-08:00'),
        end: createEventTime('2025-01-06T15:00:00-08:00'),
        checkAllDayEvents: false,
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(false);
      expect(result.severity).toBe('none');
    });
  });

  describe('Recurring Events', () => {
    it('should detect conflict with recurring event', async () => {
      const recurringEvent = createEvent(
        'event-1',
        'Weekly Standup',
        createEventTime('2025-01-06T09:00:00-08:00'),
        createEventTime('2025-01-06T09:30:00-08:00'),
        {
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'],
        }
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [recurringEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T09:00:00-08:00'),
        end: createEventTime('2025-01-06T10:00:00-08:00'),
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts[0].type).toBe('recurring_conflict');
    });
  });

  describe('Multiple Conflicts', () => {
    it('should detect multiple overlapping conflicts', async () => {
      const event1 = createEvent(
        'event-1',
        'Meeting 1',
        createEventTime('2025-01-06T14:00:00-08:00'),
        createEventTime('2025-01-06T14:30:00-08:00')
      );

      const event2 = createEvent(
        'event-2',
        'Meeting 2',
        createEventTime('2025-01-06T14:45:00-08:00'),
        createEventTime('2025-01-06T15:15:00-08:00')
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [event1, event2],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:00:00-08:00'),
        end: createEventTime('2025-01-06T15:00:00-08:00'),
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(2);
      expect(result.severity).toBe('error');
    });

    it('should determine correct overall severity', async () => {
      const event1 = createEvent(
        'event-1',
        'Meeting 1',
        createEventTime('2025-01-06T14:00:00-08:00'),
        createEventTime('2025-01-06T14:30:00-08:00')
      );

      const event2 = createEvent(
        'event-2',
        'Meeting 2',
        createEventTime('2025-01-06T15:00:00-08:00'),
        createEventTime('2025-01-06T15:30:00-08:00')
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [event1, event2],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:00:00-08:00'),
        end: createEventTime('2025-01-06T15:30:00-08:00'),
        bufferMinutes: 15,
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(2);
      // Should have error severity due to direct overlap with event1
      expect(result.severity).toBe('error');
    });
  });

  describe('Suggested Times', () => {
    it('should suggest alternative times when conflicts exist', async () => {
      const existingEvent = createEvent(
        'event-1',
        'Existing Meeting',
        createEventTime('2025-01-06T14:00:00-08:00'),
        createEventTime('2025-01-06T15:00:00-08:00')
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [existingEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:30:00-08:00'),
        end: createEventTime('2025-01-06T15:30:00-08:00'),
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(true);
      expect(result.suggestedTimes).toBeDefined();
      expect(result.suggestedTimes!.length).toBeGreaterThan(0);

      // Check that suggested times are valid ISO strings
      result.suggestedTimes!.forEach((suggestion) => {
        expect(suggestion.start).toBeTruthy();
        expect(suggestion.end).toBeTruthy();
        expect(suggestion.reason).toBeTruthy();
        expect(new Date(suggestion.start).toISOString()).toBe(suggestion.start);
        expect(new Date(suggestion.end).toISOString()).toBe(suggestion.end);
      });
    });

    it('should not suggest times when no conflicts', async () => {
      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:00:00-08:00'),
        end: createEventTime('2025-01-06T15:00:00-08:00'),
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(false);
      expect(result.suggestedTimes).toBeUndefined();
    });
  });

  describe('Multiple Calendars', () => {
    it('should check conflicts across multiple calendars', async () => {
      vi.mocked(calendarService.listCalendars).mockResolvedValue({
        calendars: [
          { id: 'primary', summary: 'Primary', accessRole: 'owner' },
          { id: 'work@example.com', summary: 'Work', accessRole: 'owner' },
        ],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const event1 = createEvent(
        'event-1',
        'Personal Meeting',
        createEventTime('2025-01-06T14:00:00-08:00'),
        createEventTime('2025-01-06T14:30:00-08:00')
      );

      const event2 = createEvent(
        'event-2',
        'Work Meeting',
        createEventTime('2025-01-06T14:15:00-08:00'),
        createEventTime('2025-01-06T14:45:00-08:00')
      );

      // Mock different responses for different calendar IDs
      vi.mocked(calendarService.listEvents)
        .mockResolvedValueOnce({
          events: [event1],
          nextPageToken: undefined,
          nextSyncToken: undefined,
        })
        .mockResolvedValueOnce({
          events: [event2],
          nextPageToken: undefined,
          nextSyncToken: undefined,
        });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T14:00:00-08:00'),
        end: createEventTime('2025-01-06T15:00:00-08:00'),
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
      expect(result.checkedCalendars).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('should throw error for invalid time range', async () => {
      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-06T15:00:00-08:00'),
        end: createEventTime('2025-01-06T14:00:00-08:00'), // End before start
      };

      await expect(checkConflicts('user-123', request)).rejects.toThrow(
        'Event start time must be before end time'
      );
    });

    it('should handle events at midnight boundary', async () => {
      const midnightEvent = createEvent(
        'event-1',
        'Midnight Event',
        createEventTime('2025-01-06T23:30:00-08:00'),
        createEventTime('2025-01-07T00:30:00-08:00')
      );

      vi.mocked(calendarService.listEvents).mockResolvedValue({
        events: [midnightEvent],
        nextPageToken: undefined,
        nextSyncToken: undefined,
      });

      const request: ConflictCheckRequest = {
        start: createEventTime('2025-01-07T00:00:00-08:00'),
        end: createEventTime('2025-01-07T01:00:00-08:00'),
      };

      const result = await checkConflicts('user-123', request);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
    });
  });
});
