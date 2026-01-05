/**
 * Calendar Conflict Detection Service
 * Implements efficient conflict detection using interval-based algorithms
 */

import { listEvents, listCalendars } from './index';
import type {
  CalendarEvent,
  EventTime,
  ConflictCheckRequest,
  ConflictCheckResponse,
  EventConflict,
  ConflictType,
  ConflictSeverity,
  TimeInterval,
} from './types';

/**
 * Convert EventTime to Date object with timezone handling
 */
function eventTimeToDate(eventTime: EventTime, defaultTimezone?: string): Date {
  if (eventTime.dateTime) {
    return new Date(eventTime.dateTime);
  }

  if (eventTime.date) {
    // All-day event: use start of day in specified timezone or UTC
    const timezone = eventTime.timeZone || defaultTimezone || 'UTC';
    const dateStr = `${eventTime.date}T00:00:00`;

    // For simplicity, parse as local time (proper timezone handling would require a library)
    return new Date(dateStr);
  }

  throw new Error('EventTime must have either dateTime or date');
}

/**
 * Check if an event is an all-day event
 */
function isAllDayEvent(event: CalendarEvent): boolean {
  return !event.start.dateTime && !!event.start.date;
}

/**
 * Get event duration in minutes
 */
function getEventDuration(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
}

/**
 * Check if two time intervals overlap (including buffer time consideration)
 */
function intervalsOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date,
  bufferMinutes: number = 0
): boolean {
  // First check for actual time overlap (without buffer)
  const hasDirectOverlap = start1 < end2 && start2 < end1;

  if (hasDirectOverlap) {
    return true; // Direct overlap always counts
  }

  // If no direct overlap, check if buffer time creates a conflict
  // This handles back-to-back events that need buffer time
  if (bufferMinutes > 0) {
    // Calculate gap between events
    const gap1to2 = start2.getTime() - end1.getTime(); // Gap from end of event1 to start of event2
    const gap2to1 = start1.getTime() - end2.getTime(); // Gap from end of event2 to start of event1

    const actualGap = Math.min(
      gap1to2 >= 0 ? gap1to2 : Infinity,
      gap2to1 >= 0 ? gap2to1 : Infinity
    );

    // If there's a gap but it's less than buffer requirement, it's a conflict
    if (actualGap < bufferMinutes * 60 * 1000) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate overlap between two intervals
 */
function calculateOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): { start: Date; end: Date; duration: number } | null {
  const overlapStart = new Date(Math.max(start1.getTime(), start2.getTime()));
  const overlapEnd = new Date(Math.min(end1.getTime(), end2.getTime()));

  if (overlapStart >= overlapEnd) {
    return null; // No overlap
  }

  return {
    start: overlapStart,
    end: overlapEnd,
    duration: getEventDuration(overlapStart, overlapEnd),
  };
}

/**
 * Determine conflict type based on overlap characteristics
 */
function determineConflictType(
  proposedStart: Date,
  proposedEnd: Date,
  eventStart: Date,
  eventEnd: Date,
  bufferMinutes: number,
  isRecurring: boolean
): ConflictType {
  // Check for direct overlap
  const overlap = calculateOverlap(proposedStart, proposedEnd, eventStart, eventEnd);

  if (overlap && overlap.duration > 0) {
    // Check if it's a complete double-booking (same times)
    if (
      proposedStart.getTime() === eventStart.getTime() &&
      proposedEnd.getTime() === eventEnd.getTime()
    ) {
      return 'double_booking';
    }

    // Check if it's a recurring event conflict
    if (isRecurring) {
      return 'recurring_conflict';
    }

    return 'direct_overlap';
  }

  // Check for back-to-back with insufficient buffer
  if (bufferMinutes > 0) {
    const timeBetween = Math.abs(
      Math.min(
        Math.abs(proposedStart.getTime() - eventEnd.getTime()),
        Math.abs(eventStart.getTime() - proposedEnd.getTime())
      )
    );

    if (timeBetween < bufferMinutes * 60 * 1000) {
      return 'back_to_back';
    }
  }

  return 'direct_overlap'; // Default fallback
}

/**
 * Determine conflict severity
 */
function determineConflictSeverity(
  conflictType: ConflictType,
  overlapDuration: number,
  eventStatus?: string
): ConflictSeverity {
  // Cancelled events are just warnings
  if (eventStatus === 'cancelled') {
    return 'warning';
  }

  // Back-to-back without buffer is a warning
  if (conflictType === 'back_to_back') {
    return 'warning';
  }

  // Double-booking and direct overlaps are errors
  if (conflictType === 'double_booking' || conflictType === 'direct_overlap') {
    return 'error';
  }

  // Recurring conflicts with significant overlap are errors
  if (conflictType === 'recurring_conflict' && overlapDuration > 15) {
    return 'error';
  }

  return 'warning';
}

/**
 * Generate conflict message
 */
function generateConflictMessage(
  conflict: EventConflict,
  proposedSummary?: string
): string {
  const event = conflict.conflictingEvent;
  const duration = conflict.overlapDuration;

  switch (conflict.type) {
    case 'double_booking':
      return `Double-booked with "${event.summary}" at the exact same time`;

    case 'direct_overlap':
      return `Overlaps with "${event.summary}" for ${duration} minute${duration !== 1 ? 's' : ''}`;

    case 'back_to_back':
      return `Back-to-back with "${event.summary}" without sufficient buffer time`;

    case 'recurring_conflict':
      return `Conflicts with recurring event "${event.summary}"`;

    default:
      return `Conflicts with "${event.summary}"`;
  }
}

/**
 * Sort intervals by start time for sweep line algorithm
 * O(n log n) complexity
 */
function sortIntervals(intervals: TimeInterval[]): TimeInterval[] {
  return [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Detect conflicts using sweep line algorithm
 * O(n log n) time complexity where n is number of events
 */
function detectConflictsSweepLine(
  proposedStart: Date,
  proposedEnd: Date,
  events: CalendarEvent[],
  options: {
    bufferMinutes: number;
    excludeEventId?: string;
    checkAllDayEvents: boolean;
  }
): EventConflict[] {
  const conflicts: EventConflict[] = [];
  const { bufferMinutes, excludeEventId, checkAllDayEvents } = options;

  // Filter and convert events to time intervals
  const intervals: TimeInterval[] = events
    .filter((event) => {
      // Skip excluded event (for updates)
      if (excludeEventId && event.id === excludeEventId) {
        return false;
      }

      // Skip cancelled events
      if (event.status === 'cancelled') {
        return false;
      }

      // Skip transparent events (marked as "free" time)
      if (event.transparency === 'transparent') {
        return false;
      }

      // Skip all-day events if requested
      if (!checkAllDayEvents && isAllDayEvent(event)) {
        return false;
      }

      return true;
    })
    .map((event) => ({
      start: eventTimeToDate(event.start, event.start.timeZone),
      end: eventTimeToDate(event.end, event.end.timeZone),
      event,
    }));

  // Sort intervals by start time
  const sortedIntervals = sortIntervals(intervals);

  // Sweep through sorted intervals
  for (const interval of sortedIntervals) {
    const { start: eventStart, end: eventEnd, event } = interval;

    // Early termination: if event starts after proposed end + buffer, no more conflicts
    if (eventStart.getTime() > proposedEnd.getTime() + bufferMinutes * 60 * 1000) {
      break;
    }

    // Check for overlap
    if (intervalsOverlap(proposedStart, proposedEnd, eventStart, eventEnd, bufferMinutes)) {
      const overlap = calculateOverlap(proposedStart, proposedEnd, eventStart, eventEnd);
      const isRecurring = !!event.recurringEventId || !!event.recurrence;

      const conflictType = determineConflictType(
        proposedStart,
        proposedEnd,
        eventStart,
        eventEnd,
        bufferMinutes,
        isRecurring
      );

      const overlapDuration = overlap ? overlap.duration : 0;
      const severity = determineConflictSeverity(conflictType, overlapDuration, event.status);

      const conflict: EventConflict = {
        type: conflictType,
        severity,
        conflictingEvent: event,
        overlapStart: overlap?.start.toISOString() || eventStart.toISOString(),
        overlapEnd: overlap?.end.toISOString() || eventEnd.toISOString(),
        overlapDuration,
        message: '', // Will be set after creation
      };

      conflict.message = generateConflictMessage(conflict);
      conflicts.push(conflict);
    }
  }

  return conflicts;
}

/**
 * Suggest alternative time slots (basic implementation)
 */
function suggestAlternativeTimes(
  proposedStart: Date,
  proposedEnd: Date,
  conflicts: EventConflict[],
  allEvents: CalendarEvent[]
): Array<{ start: string; end: string; reason: string }> {
  const suggestions: Array<{ start: string; end: string; reason: string }> = [];
  const duration = getEventDuration(proposedStart, proposedEnd);

  // If no conflicts, no suggestions needed
  if (conflicts.length === 0) {
    return suggestions;
  }

  // Suggest time slots before the first conflict
  const firstConflict = conflicts[0];
  const firstConflictStart = new Date(firstConflict.overlapStart);

  // Check if there's enough time before the first conflict
  const timeBeforeFirst = getEventDuration(proposedStart, firstConflictStart);
  if (timeBeforeFirst >= duration) {
    const suggestedEnd = new Date(firstConflictStart.getTime() - 5 * 60 * 1000); // 5 min buffer
    const suggestedStart = new Date(suggestedEnd.getTime() - duration * 60 * 1000);

    suggestions.push({
      start: suggestedStart.toISOString(),
      end: suggestedEnd.toISOString(),
      reason: `Before conflicting event "${firstConflict.conflictingEvent.summary}"`,
    });
  }

  // Suggest time slots after the last conflict
  const lastConflict = conflicts[conflicts.length - 1];
  const lastConflictEnd = new Date(lastConflict.overlapEnd);
  const suggestedStart = new Date(lastConflictEnd.getTime() + 5 * 60 * 1000); // 5 min buffer
  const suggestedEnd = new Date(suggestedStart.getTime() + duration * 60 * 1000);

  suggestions.push({
    start: suggestedStart.toISOString(),
    end: suggestedEnd.toISOString(),
    reason: `After conflicting event "${lastConflict.conflictingEvent.summary}"`,
  });

  return suggestions.slice(0, 3); // Return max 3 suggestions
}

/**
 * Main conflict detection function
 */
export async function checkConflicts(
  userId: string,
  request: ConflictCheckRequest
): Promise<ConflictCheckResponse> {
  const {
    start,
    end,
    calendarIds,
    excludeEventId,
    bufferMinutes = 0,
    checkAllDayEvents = true,
  } = request;

  // Convert proposed times to Date objects
  const proposedStart = eventTimeToDate(start);
  const proposedEnd = eventTimeToDate(end);

  // Validate proposed time range
  if (proposedStart >= proposedEnd) {
    throw new Error('Event start time must be before end time');
  }

  // Determine which calendars to check
  let calendarsToCheck: string[];
  if (calendarIds && calendarIds.length > 0) {
    calendarsToCheck = calendarIds;
  } else {
    // Get all user calendars
    const { calendars } = await listCalendars(userId);
    calendarsToCheck = calendars
      .filter((cal) => !cal.deleted && !cal.hidden)
      .map((cal) => cal.id);
  }

  // Fetch events from all calendars in the time range
  // Add buffer to time range to catch back-to-back events
  const timeMin = new Date(proposedStart.getTime() - bufferMinutes * 60 * 1000).toISOString();
  const timeMax = new Date(proposedEnd.getTime() + bufferMinutes * 60 * 1000).toISOString();

  const allEvents: CalendarEvent[] = [];

  for (const calendarId of calendarsToCheck) {
    try {
      const { events } = await listEvents(userId, {
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true, // Expand recurring events
      });
      allEvents.push(...events);
    } catch (error) {
      console.error(`Failed to fetch events from calendar ${calendarId}:`, error);
      // Continue with other calendars
    }
  }

  // Detect conflicts using sweep line algorithm
  const conflicts = detectConflictsSweepLine(proposedStart, proposedEnd, allEvents, {
    bufferMinutes,
    excludeEventId,
    checkAllDayEvents,
  });

  // Determine overall severity
  const severity: ConflictSeverity = conflicts.length === 0
    ? 'none'
    : conflicts.some((c) => c.severity === 'error')
    ? 'error'
    : 'warning';

  // Generate suggestions if there are conflicts
  const suggestedTimes =
    conflicts.length > 0 ? suggestAlternativeTimes(proposedStart, proposedEnd, conflicts, allEvents) : undefined;

  return {
    hasConflicts: conflicts.length > 0,
    severity,
    conflicts,
    suggestedTimes,
    checkedCalendars: calendarsToCheck,
    bufferMinutes,
  };
}

/**
 * Export conflict detection types
 */
export type {
  ConflictCheckRequest,
  ConflictCheckResponse,
  EventConflict,
  ConflictType,
  ConflictSeverity,
};
