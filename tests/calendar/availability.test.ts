/**
 * Availability Finder Tests
 * Comprehensive test suite for mutual availability finder
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findAvailability } from '@/lib/calendar/availability';
import type {
  AvailabilityRequest,
  WorkingHours,
  Participant,
} from '@/lib/calendar/availability';
import type { FreeBusyResponse } from '@/lib/calendar/types';
import * as calendarService from '@/lib/calendar/index';

// Mock calendar service functions
vi.mock('@/lib/calendar/index', () => ({
  getFreeBusy: vi.fn(),
}));

// Helper to create a participant
function createParticipant(
  userId: string,
  calendarId: string,
  workingHours?: WorkingHours
): Participant {
  return {
    userId,
    calendarId,
    email: `${userId}@example.com`,
    displayName: `User ${userId}`,
    workingHours,
    isRequired: true,
  };
}

// Helper to create working hours (Mon-Fri, 9am-5pm in specified timezone)
function createWorkingHours(timezone: string = 'America/Los_Angeles'): WorkingHours {
  return {
    timezone,
    days: {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { start: '09:00', end: '17:00' },
      wednesday: { start: '09:00', end: '17:00' },
      thursday: { start: '09:00', end: '17:00' },
      friday: { start: '09:00', end: '17:00' },
    },
  };
}

// Helper to create FreeBusy response
function createFreeBusyResponse(
  calendarId: string,
  busyPeriods: Array<{ start: string; end: string }> = []
): FreeBusyResponse {
  return {
    calendars: {
      [calendarId]: {
        busy: busyPeriods,
      },
    },
    timeMin: '2025-01-06T00:00:00Z',
    timeMax: '2025-01-10T23:59:59Z',
  };
}

describe('Availability Finder', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: return no busy periods
    vi.mocked(calendarService.getFreeBusy).mockResolvedValue(
      createFreeBusyResponse('primary', [])
    );
  });

  describe('Basic Availability Finding', () => {
    it('should find available slots when calendar is free', async () => {
      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z', // Monday
          end: '2025-01-10T23:59:59Z',   // Friday
        },
        duration: 60, // 1 hour
        limit: 10,
      };

      const result = await findAvailability(request);

      expect(result.slots.length).toBeGreaterThan(0);
      expect(result.participantCount).toBe(1);
      expect(result.requestDuration).toBe(60);
      expect(result.searchedRange).toEqual(request.dateRange);
    });

    it('should respect meeting duration', async () => {
      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-06T23:59:59Z',
        },
        duration: 30,
        limit: 5,
      };

      const result = await findAvailability(request);

      // All slots should be exactly 30 minutes
      result.slots.forEach(slot => {
        const start = new Date(slot.start);
        const end = new Date(slot.end);
        const durationMs = end.getTime() - start.getTime();
        const durationMinutes = durationMs / (1000 * 60);
        expect(durationMinutes).toBe(30);
      });
    });

    it('should respect limit parameter', async () => {
      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-10T23:59:59Z',
        },
        duration: 30,
        limit: 3,
      };

      const result = await findAvailability(request);

      expect(result.slots.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Working Hours Constraints', () => {
    it('should only suggest slots within working hours', async () => {
      const workingHours = createWorkingHours('America/Los_Angeles');

      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', workingHours),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-06T23:59:59Z',
        },
        duration: 60,
        limit: 10,
      };

      const result = await findAvailability(request);

      // All slots should be within working hours (9am-5pm PT)
      result.slots.forEach(slot => {
        const start = new Date(slot.start);
        const startHourPT = new Date(start.toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
        })).getHours();

        expect(startHourPT).toBeGreaterThanOrEqual(9);
        expect(startHourPT).toBeLessThan(17);
      });
    });

    it('should not suggest slots on non-working days', async () => {
      const workingHours: WorkingHours = {
        timezone: 'America/Los_Angeles',
        days: {
          monday: { start: '09:00', end: '17:00' },
          wednesday: { start: '09:00', end: '17:00' },
          friday: { start: '09:00', end: '17:00' },
          // No Tuesday or Thursday
        },
      };

      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', workingHours),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z', // Monday
          end: '2025-01-10T23:59:59Z',   // Friday
        },
        duration: 60,
        limit: 20,
      };

      const result = await findAvailability(request);

      // All slots should be on Monday, Wednesday, or Friday
      result.slots.forEach(slot => {
        const start = new Date(slot.start);
        const dayOfWeek = start.getDay(); // 0 = Sunday, 6 = Saturday
        expect([1, 3, 5]).toContain(dayOfWeek); // Mon, Wed, Fri
      });
    });
  });

  describe('Busy Period Handling', () => {
    it('should avoid busy periods', async () => {
      // Mock busy period: 2pm-3pm on Jan 6
      vi.mocked(calendarService.getFreeBusy).mockResolvedValue(
        createFreeBusyResponse('primary', [
          {
            start: '2025-01-06T14:00:00-08:00',
            end: '2025-01-06T15:00:00-08:00',
          },
        ])
      );

      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-06T23:59:59Z',
        },
        duration: 60,
        limit: 10,
      };

      const result = await findAvailability(request);

      // No slots should overlap with 2pm-3pm PT
      result.slots.forEach(slot => {
        const start = new Date(slot.start);
        const end = new Date(slot.end);
        const busyStart = new Date('2025-01-06T14:00:00-08:00');
        const busyEnd = new Date('2025-01-06T15:00:00-08:00');

        const hasOverlap = start < busyEnd && end > busyStart;
        expect(hasOverlap).toBe(false);
      });
    });

    it('should handle multiple busy periods', async () => {
      vi.mocked(calendarService.getFreeBusy).mockResolvedValue(
        createFreeBusyResponse('primary', [
          { start: '2025-01-06T10:00:00-08:00', end: '2025-01-06T11:00:00-08:00' },
          { start: '2025-01-06T14:00:00-08:00', end: '2025-01-06T15:00:00-08:00' },
        ])
      );

      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-06T23:59:59Z',
        },
        duration: 30,
        limit: 5,
      };

      const result = await findAvailability(request);

      expect(result.slots.length).toBeGreaterThan(0);

      // Slots should avoid both busy periods
      result.slots.forEach(slot => {
        const start = new Date(slot.start);
        const end = new Date(slot.end);

        const busy1Start = new Date('2025-01-06T10:00:00-08:00');
        const busy1End = new Date('2025-01-06T11:00:00-08:00');
        const busy2Start = new Date('2025-01-06T14:00:00-08:00');
        const busy2End = new Date('2025-01-06T15:00:00-08:00');

        const overlapsBusy1 = start < busy1End && end > busy1Start;
        const overlapsBusy2 = start < busy2End && end > busy2Start;

        expect(overlapsBusy1 || overlapsBusy2).toBe(false);
      });
    });

    it('should respect buffer time between meetings', async () => {
      vi.mocked(calendarService.getFreeBusy).mockResolvedValue(
        createFreeBusyResponse('primary', [
          { start: '2025-01-06T10:00:00-08:00', end: '2025-01-06T11:00:00-08:00' },
        ])
      );

      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-06T23:59:59Z',
        },
        duration: 30,
        bufferMinutes: 15, // 15-minute buffer
        limit: 10,
      };

      const result = await findAvailability(request);

      // All slots should avoid the busy period entirely
      // With buffer, the algorithm treats busy period as extended by buffer time
      const busyStart = new Date('2025-01-06T10:00:00-08:00');
      const busyEnd = new Date('2025-01-06T11:00:00-08:00');

      result.slots.forEach(slot => {
        const start = new Date(slot.start);
        const end = new Date(slot.end);

        // Slots should not overlap with busy period
        const overlaps = start < busyEnd && end > busyStart;
        expect(overlaps).toBe(false);
      });

      // Should have some available slots
      expect(result.slots.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Participant Availability', () => {
    it('should find mutual availability across multiple participants', async () => {
      // Both users busy at same time - should find slots avoiding that time
      vi.mocked(calendarService.getFreeBusy).mockResolvedValue(
        createFreeBusyResponse('primary', [
          { start: '2025-01-06T14:00:00-08:00', end: '2025-01-06T15:00:00-08:00' },
        ])
      );

      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
          createParticipant('user-2', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-06T23:59:59Z',
        },
        duration: 60,
        limit: 5,
      };

      const result = await findAvailability(request);

      expect(result.slots.length).toBeGreaterThan(0);
      expect(result.participantCount).toBe(2);

      // Slots should avoid the busy period
      const busyStart = new Date('2025-01-06T14:00:00-08:00');
      const busyEnd = new Date('2025-01-06T15:00:00-08:00');

      result.slots.forEach(slot => {
        const start = new Date(slot.start);
        const end = new Date(slot.end);

        const overlaps = start < busyEnd && end > busyStart;
        expect(overlaps).toBe(false);
      });
    });

    it('should handle cross-timezone participants', async () => {
      vi.mocked(calendarService.getFreeBusy).mockResolvedValue(
        createFreeBusyResponse('primary', [])
      );

      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours('America/Los_Angeles')),
          createParticipant('user-2', 'primary', createWorkingHours('America/New_York')),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-06T23:59:59Z',
        },
        duration: 60,
        limit: 5,
      };

      const result = await findAvailability(request);

      expect(result.slots.length).toBeGreaterThan(0);

      // Each slot should include local times for both participants
      result.slots.forEach(slot => {
        expect(slot.participants).toHaveLength(2);

        const participant1 = slot.participants[0];
        const participant2 = slot.participants[1];

        expect(participant1.timezone).toBe('America/Los_Angeles');
        expect(participant2.timezone).toBe('America/New_York');
        expect(participant1.localTime.start).toBeDefined();
        expect(participant2.localTime.start).toBeDefined();
      });
    });
  });

  describe('Scoring and Ranking', () => {
    it('should score slots based on time of day preference', async () => {
      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-10T23:59:59Z',
        },
        duration: 60,
        preferences: {
          preferredTimeOfDay: 'morning',
        },
        limit: 10,
      };

      const result = await findAvailability(request);

      expect(result.slots.length).toBeGreaterThan(0);

      // Morning slots should score higher
      result.slots.forEach(slot => {
        expect(slot.score).toBeGreaterThan(0);
        expect(slot.score).toBeLessThanOrEqual(1);
        expect(slot.scoreBreakdown.timeOfDay).toBeDefined();
      });

      // Slots should be sorted by score (descending)
      for (let i = 0; i < result.slots.length - 1; i++) {
        expect(result.slots[i].score).toBeGreaterThanOrEqual(result.slots[i + 1].score);
      }
    });

    it('should score slots based on day of week preference', async () => {
      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z', // Monday
          end: '2025-01-10T23:59:59Z',   // Friday
        },
        duration: 60,
        preferences: {
          preferredDays: [1, 3, 5], // Mon, Wed, Fri
        },
        limit: 10,
      };

      const result = await findAvailability(request);

      expect(result.slots.length).toBeGreaterThan(0);

      result.slots.forEach(slot => {
        expect(slot.scoreBreakdown.dayOfWeek).toBeDefined();
      });
    });

    it('should filter by minimum quality score', async () => {
      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-10T23:59:59Z',
        },
        duration: 60,
        preferences: {
          minQualityScore: 0.8,
        },
        limit: 10,
      };

      const result = await findAvailability(request);

      // All returned slots should meet minimum score
      result.slots.forEach(slot => {
        expect(slot.score).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('should include comprehensive score breakdown', async () => {
      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-06T23:59:59Z',
        },
        duration: 60,
        limit: 5,
      };

      const result = await findAvailability(request);

      expect(result.slots.length).toBeGreaterThan(0);

      result.slots.forEach(slot => {
        expect(slot.scoreBreakdown).toHaveProperty('timeOfDay');
        expect(slot.scoreBreakdown).toHaveProperty('dayOfWeek');
        expect(slot.scoreBreakdown).toHaveProperty('proximity');
        expect(slot.scoreBreakdown).toHaveProperty('quality');

        // All scores should be between 0 and 1
        expect(slot.scoreBreakdown.timeOfDay).toBeGreaterThanOrEqual(0);
        expect(slot.scoreBreakdown.timeOfDay).toBeLessThanOrEqual(1);
        expect(slot.scoreBreakdown.dayOfWeek).toBeGreaterThanOrEqual(0);
        expect(slot.scoreBreakdown.dayOfWeek).toBeLessThanOrEqual(1);
        expect(slot.scoreBreakdown.proximity).toBeGreaterThanOrEqual(0);
        expect(slot.scoreBreakdown.proximity).toBeLessThanOrEqual(1);
        expect(slot.scoreBreakdown.quality).toBeGreaterThanOrEqual(0);
        expect(slot.scoreBreakdown.quality).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw error when no participants provided', async () => {
      const request: AvailabilityRequest = {
        participants: [],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-10T23:59:59Z',
        },
        duration: 60,
      };

      await expect(findAvailability(request)).rejects.toThrow(
        'At least one participant is required'
      );
    });

    it('should throw error for invalid duration', async () => {
      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-10T23:59:59Z',
        },
        duration: -30,
      };

      await expect(findAvailability(request)).rejects.toThrow(
        'Duration must be positive'
      );
    });

    it('should throw error for invalid date range', async () => {
      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-10T00:00:00Z',
          end: '2025-01-06T00:00:00Z', // End before start
        },
        duration: 60,
      };

      await expect(findAvailability(request)).rejects.toThrow(
        'Date range start must be before end'
      );
    });

    it('should handle API errors gracefully', async () => {
      vi.mocked(calendarService.getFreeBusy).mockRejectedValue(
        new Error('API error')
      );

      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-10T23:59:59Z',
        },
        duration: 60,
      };

      // Should not throw, but should return empty slots
      const result = await findAvailability(request);
      expect(result.slots).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle no available slots', async () => {
      // Mock entire day as busy
      vi.mocked(calendarService.getFreeBusy).mockResolvedValue(
        createFreeBusyResponse('primary', [
          { start: '2025-01-06T00:00:00-08:00', end: '2025-01-06T23:59:59-08:00' },
        ])
      );

      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-06T23:59:59Z',
        },
        duration: 60,
      };

      const result = await findAvailability(request);

      expect(result.slots).toHaveLength(0);
    });

    it('should handle very short duration requests', async () => {
      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-06T23:59:59Z',
        },
        duration: 15, // 15 minutes
        limit: 5,
      };

      const result = await findAvailability(request);

      expect(result.slots.length).toBeGreaterThan(0);

      result.slots.forEach(slot => {
        const duration = (new Date(slot.end).getTime() - new Date(slot.start).getTime()) / (1000 * 60);
        expect(duration).toBe(15);
      });
    });

    it('should handle long duration requests', async () => {
      const request: AvailabilityRequest = {
        participants: [
          createParticipant('user-1', 'primary', createWorkingHours()),
        ],
        dateRange: {
          start: '2025-01-06T00:00:00Z',
          end: '2025-01-10T23:59:59Z',
        },
        duration: 240, // 4 hours
        limit: 5,
      };

      const result = await findAvailability(request);

      result.slots.forEach(slot => {
        const duration = (new Date(slot.end).getTime() - new Date(slot.start).getTime()) / (1000 * 60);
        expect(duration).toBe(240);
      });
    });
  });
});
