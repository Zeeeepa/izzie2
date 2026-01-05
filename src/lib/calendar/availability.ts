/**
 * Calendar Availability Finder
 * Finds mutual free time across multiple calendars with timezone support
 */

import { getFreeBusy } from './index';
import type { FreeBusyRequest, FreeBusyResponse, TimePeriod } from './types';

/**
 * Working hours configuration for a participant
 */
export interface WorkingHours {
  timezone: string; // IANA timezone identifier (e.g., 'America/New_York')
  days: {
    monday?: { start: string; end: string }; // HH:mm format (e.g., '09:00', '17:00')
    tuesday?: { start: string; end: string };
    wednesday?: { start: string; end: string };
    thursday?: { start: string; end: string };
    friday?: { start: string; end: string };
    saturday?: { start: string; end: string };
    sunday?: { start: string; end: string };
  };
}

/**
 * Participant in availability search
 */
export interface Participant {
  calendarId: string;
  userId: string;
  email?: string;
  displayName?: string;
  workingHours?: WorkingHours;
  isRequired?: boolean; // If false, availability is optional
}

/**
 * Time slot preference configuration
 */
export interface TimePreferences {
  // Preferred time of day
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'any';

  // Preferred days of week (1 = Monday, 7 = Sunday)
  preferredDays?: number[];

  // Avoid days of week
  avoidDays?: number[];

  // Prefer sooner slots over later ones
  preferSooner?: boolean;

  // Minimum quality score threshold (0-1)
  minQualityScore?: number;
}

/**
 * Availability search request
 */
export interface AvailabilityRequest {
  participants: Participant[];
  dateRange: {
    start: string; // ISO 8601 timestamp
    end: string; // ISO 8601 timestamp
  };
  duration: number; // Meeting duration in minutes
  bufferMinutes?: number; // Buffer time between meetings (default: 0)
  preferences?: TimePreferences;
  limit?: number; // Max number of suggestions to return (default: 10)
}

/**
 * Available time slot with scoring
 */
export interface AvailableSlot {
  start: string; // ISO 8601 timestamp
  end: string; // ISO 8601 timestamp
  score: number; // Overall score (0-1, higher is better)
  scoreBreakdown: {
    timeOfDay: number; // Score based on time of day preference
    dayOfWeek: number; // Score based on day of week preference
    proximity: number; // Score based on how soon the slot is
    quality: number; // General quality score (not too early/late)
  };
  participants: {
    calendarId: string;
    timezone: string;
    localTime: {
      start: string; // ISO 8601 in participant's timezone
      end: string; // ISO 8601 in participant's timezone
    };
  }[];
}

/**
 * Availability search response
 */
export interface AvailabilityResponse {
  slots: AvailableSlot[];
  searchedRange: {
    start: string;
    end: string;
  };
  participantCount: number;
  requestDuration: number;
}

/**
 * Default working hours (Monday-Friday, 9am-5pm local time)
 */
const DEFAULT_WORKING_HOURS: WorkingHours = {
  timezone: 'UTC',
  days: {
    monday: { start: '09:00', end: '17:00' },
    tuesday: { start: '09:00', end: '17:00' },
    wednesday: { start: '09:00', end: '17:00' },
    thursday: { start: '09:00', end: '17:00' },
    friday: { start: '09:00', end: '17:00' },
  },
};

/**
 * Day of week names for working hours lookup
 */
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/**
 * Convert time string (HH:mm) to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Check if a date falls within working hours for a participant
 */
function isWithinWorkingHours(date: Date, workingHours: WorkingHours): boolean {
  // Convert date to participant's timezone
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: workingHours.timezone }));
  const dayOfWeek = localDate.getDay(); // 0 = Sunday, 6 = Saturday
  const dayName = DAY_NAMES[dayOfWeek];

  const dayConfig = workingHours.days[dayName];
  if (!dayConfig) {
    return false; // Not a working day
  }

  // Get minutes since midnight in local timezone
  const currentMinutes = localDate.getHours() * 60 + localDate.getMinutes();
  const startMinutes = timeToMinutes(dayConfig.start);
  const endMinutes = timeToMinutes(dayConfig.end);

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Merge overlapping busy periods
 */
function mergeBusyPeriods(periods: TimePeriod[]): TimePeriod[] {
  if (periods.length === 0) return [];

  // Sort by start time
  const sorted = [...periods].sort((a, b) =>
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const merged: TimePeriod[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (new Date(current.start) <= new Date(last.end)) {
      // Overlapping periods, merge them
      last.end = new Date(Math.max(
        new Date(last.end).getTime(),
        new Date(current.end).getTime()
      )).toISOString();
    } else {
      // Non-overlapping, add to list
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Find free periods between busy periods
 */
function findFreePeriods(
  rangeStart: Date,
  rangeEnd: Date,
  busyPeriods: TimePeriod[],
  duration: number
): TimePeriod[] {
  const freePeriods: TimePeriod[] = [];
  const merged = mergeBusyPeriods(busyPeriods);

  let currentTime = rangeStart;

  for (const busy of merged) {
    const busyStart = new Date(busy.start);

    // Check if there's a free period before this busy period
    if (currentTime < busyStart) {
      const freeMinutes = (busyStart.getTime() - currentTime.getTime()) / (1000 * 60);

      if (freeMinutes >= duration) {
        freePeriods.push({
          start: currentTime.toISOString(),
          end: busyStart.toISOString(),
        });
      }
    }

    // Move past the busy period
    currentTime = new Date(Math.max(currentTime.getTime(), new Date(busy.end).getTime()));
  }

  // Check for free period after the last busy period
  if (currentTime < rangeEnd) {
    const freeMinutes = (rangeEnd.getTime() - currentTime.getTime()) / (1000 * 60);

    if (freeMinutes >= duration) {
      freePeriods.push({
        start: currentTime.toISOString(),
        end: rangeEnd.toISOString(),
      });
    }
  }

  return freePeriods;
}

/**
 * Find overlapping free periods across all participants
 */
function findMutualFreePeriods(
  participantFreePeriods: TimePeriod[][],
  duration: number
): TimePeriod[] {
  if (participantFreePeriods.length === 0) return [];
  if (participantFreePeriods.length === 1) return participantFreePeriods[0];

  // Start with the first participant's free periods
  let mutual = participantFreePeriods[0];

  // Intersect with each subsequent participant's free periods
  for (let i = 1; i < participantFreePeriods.length; i++) {
    const newMutual: TimePeriod[] = [];

    for (const period1 of mutual) {
      for (const period2 of participantFreePeriods[i]) {
        const start = new Date(Math.max(
          new Date(period1.start).getTime(),
          new Date(period2.start).getTime()
        ));

        const end = new Date(Math.min(
          new Date(period1.end).getTime(),
          new Date(period2.end).getTime()
        ));

        // Check if there's overlap and it's long enough
        const overlapMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

        if (overlapMinutes >= duration) {
          newMutual.push({
            start: start.toISOString(),
            end: end.toISOString(),
          });
        }
      }
    }

    mutual = newMutual;

    // Early exit if no mutual periods found
    if (mutual.length === 0) break;
  }

  return mutual;
}

/**
 * Filter free periods by working hours constraints
 */
function filterByWorkingHours(
  freePeriods: TimePeriod[],
  participants: Participant[],
  duration: number
): TimePeriod[] {
  const filtered: TimePeriod[] = [];

  for (const period of freePeriods) {
    const periodStart = new Date(period.start);
    const periodEnd = new Date(period.end);

    // Generate candidate slots within this free period
    let slotStart = periodStart;

    while (slotStart.getTime() + duration * 60 * 1000 <= periodEnd.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

      // Check if this slot is within working hours for all participants
      const withinWorkingHours = participants.every(participant => {
        const workingHours = participant.workingHours || DEFAULT_WORKING_HOURS;
        return isWithinWorkingHours(slotStart, workingHours) &&
               isWithinWorkingHours(slotEnd, workingHours);
      });

      if (withinWorkingHours) {
        filtered.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
        });
      }

      // Move to next potential slot (15-minute increments)
      slotStart = new Date(slotStart.getTime() + 15 * 60 * 1000);
    }
  }

  return filtered;
}

/**
 * Calculate time of day score
 */
function scoreTimeOfDay(date: Date, preference?: 'morning' | 'afternoon' | 'evening' | 'any'): number {
  if (!preference || preference === 'any') return 1.0;

  const hour = date.getHours();

  switch (preference) {
    case 'morning':
      // Prefer 8am-12pm
      if (hour >= 8 && hour < 12) return 1.0;
      if (hour >= 7 && hour < 8) return 0.8;
      if (hour >= 12 && hour < 13) return 0.7;
      return 0.3;

    case 'afternoon':
      // Prefer 1pm-5pm
      if (hour >= 13 && hour < 17) return 1.0;
      if (hour >= 12 && hour < 13) return 0.8;
      if (hour >= 17 && hour < 18) return 0.7;
      return 0.3;

    case 'evening':
      // Prefer 5pm-8pm
      if (hour >= 17 && hour < 20) return 1.0;
      if (hour >= 16 && hour < 17) return 0.8;
      if (hour >= 20 && hour < 21) return 0.7;
      return 0.3;

    default:
      return 1.0;
  }
}

/**
 * Calculate day of week score
 */
function scoreDayOfWeek(date: Date, preferences?: TimePreferences): number {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to 1 = Monday, 7 = Sunday

  // Check if day is avoided
  if (preferences?.avoidDays?.includes(isoDayOfWeek)) {
    return 0.2; // Low score for avoided days
  }

  // Check if day is preferred
  if (preferences?.preferredDays) {
    return preferences.preferredDays.includes(isoDayOfWeek) ? 1.0 : 0.5;
  }

  // Default: prefer weekdays over weekends
  return dayOfWeek >= 1 && dayOfWeek <= 5 ? 1.0 : 0.5;
}

/**
 * Calculate proximity score (prefer sooner slots)
 */
function scoreProximity(date: Date, now: Date, preferSooner: boolean = true): number {
  if (!preferSooner) return 1.0;

  const daysUntil = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  // Score decreases linearly from 1.0 (today) to 0.3 (30+ days out)
  if (daysUntil <= 0) return 1.0;
  if (daysUntil <= 7) return 1.0 - (daysUntil / 7) * 0.3; // Days 0-7: 1.0 -> 0.7
  if (daysUntil <= 30) return 0.7 - ((daysUntil - 7) / 23) * 0.4; // Days 7-30: 0.7 -> 0.3
  return 0.3; // 30+ days out
}

/**
 * Calculate general quality score
 */
function scoreQuality(date: Date): number {
  const hour = date.getHours();

  // Penalize very early or very late times
  if (hour < 7 || hour >= 20) return 0.3; // Very early/late
  if (hour < 8 || hour >= 19) return 0.7; // Somewhat early/late
  return 1.0; // Good time
}

/**
 * Score a time slot based on preferences
 */
function scoreSlot(
  slotStart: Date,
  now: Date,
  preferences?: TimePreferences
): { score: number; breakdown: AvailableSlot['scoreBreakdown'] } {
  const timeOfDay = scoreTimeOfDay(slotStart, preferences?.preferredTimeOfDay);
  const dayOfWeek = scoreDayOfWeek(slotStart, preferences);
  const proximity = scoreProximity(slotStart, now, preferences?.preferSooner);
  const quality = scoreQuality(slotStart);

  // Weighted average: time of day and quality are most important
  const score = (
    timeOfDay * 0.35 +
    dayOfWeek * 0.25 +
    proximity * 0.15 +
    quality * 0.25
  );

  return {
    score,
    breakdown: {
      timeOfDay,
      dayOfWeek,
      proximity,
      quality,
    },
  };
}

/**
 * Convert slot to participant local times
 */
function addParticipantLocalTimes(
  slot: TimePeriod,
  participants: Participant[]
): AvailableSlot['participants'] {
  return participants.map(participant => {
    const timezone = participant.workingHours?.timezone || 'UTC';
    const slotStart = new Date(slot.start);
    const slotEnd = new Date(slot.end);

    return {
      calendarId: participant.calendarId,
      timezone,
      localTime: {
        start: slotStart.toLocaleString('en-US', { timeZone: timezone }),
        end: slotEnd.toLocaleString('en-US', { timeZone: timezone }),
      },
    };
  });
}

/**
 * Find mutual availability across multiple calendars
 */
export async function findAvailability(
  request: AvailabilityRequest
): Promise<AvailabilityResponse> {
  const {
    participants,
    dateRange,
    duration,
    bufferMinutes = 0,
    preferences,
    limit = 10,
  } = request;

  // Validate request
  if (participants.length === 0) {
    throw new Error('At least one participant is required');
  }

  if (duration <= 0) {
    throw new Error('Duration must be positive');
  }

  const rangeStart = new Date(dateRange.start);
  const rangeEnd = new Date(dateRange.end);

  if (rangeStart >= rangeEnd) {
    throw new Error('Date range start must be before end');
  }

  // Separate required and optional participants
  const requiredParticipants = participants.filter(p => p.isRequired !== false);
  const optionalParticipants = participants.filter(p => p.isRequired === false);

  // Fetch busy periods for all required participants
  const busyPeriodsMap = new Map<string, TimePeriod[]>();

  for (const participant of requiredParticipants) {
    const freeBusyRequest: FreeBusyRequest = {
      timeMin: dateRange.start,
      timeMax: dateRange.end,
      items: [{ id: participant.calendarId }],
    };

    try {
      const freeBusyResponse = await getFreeBusy(participant.userId, freeBusyRequest);
      const calendarData = freeBusyResponse.calendars[participant.calendarId];

      if (calendarData?.errors) {
        console.error(`Error fetching busy periods for ${participant.calendarId}:`, calendarData.errors);
        // Continue with empty busy periods for this participant
        busyPeriodsMap.set(participant.calendarId, []);
      } else {
        busyPeriodsMap.set(participant.calendarId, calendarData?.busy || []);
      }
    } catch (error) {
      console.error(`Failed to fetch busy periods for ${participant.calendarId}:`, error);
      // Continue with empty busy periods for this participant
      busyPeriodsMap.set(participant.calendarId, []);
    }
  }

  // Find free periods for each required participant
  const participantFreePeriods: TimePeriod[][] = requiredParticipants.map(participant => {
    const busyPeriods = busyPeriodsMap.get(participant.calendarId) || [];
    return findFreePeriods(rangeStart, rangeEnd, busyPeriods, duration + bufferMinutes);
  });

  // Find mutual free periods across all required participants
  let mutualFreePeriods = findMutualFreePeriods(participantFreePeriods, duration + bufferMinutes);

  // Filter by working hours constraints
  mutualFreePeriods = filterByWorkingHours(mutualFreePeriods, requiredParticipants, duration);

  // Score and rank slots
  const now = new Date();
  const scoredSlots = mutualFreePeriods.map(period => {
    const slotStart = new Date(period.start);
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);
    const { score, breakdown } = scoreSlot(slotStart, now, preferences);

    return {
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      score,
      scoreBreakdown: breakdown,
      participants: addParticipantLocalTimes(
        { start: slotStart.toISOString(), end: slotEnd.toISOString() },
        participants
      ),
    };
  });

  // Filter by minimum quality score if specified
  let filteredSlots = scoredSlots;
  if (preferences?.minQualityScore !== undefined) {
    filteredSlots = scoredSlots.filter(slot => slot.score >= preferences.minQualityScore!);
  }

  // Sort by score (descending) and take top N
  const topSlots = filteredSlots
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    slots: topSlots,
    searchedRange: {
      start: dateRange.start,
      end: dateRange.end,
    },
    participantCount: participants.length,
    requestDuration: duration,
  };
}
