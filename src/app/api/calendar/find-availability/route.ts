/**
 * Calendar Availability Finder API Endpoint
 * POST /api/calendar/find-availability - Find mutual free time across calendars
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { findAvailability } from '@/lib/calendar/availability';
import type { AvailabilityRequest } from '@/lib/calendar/availability';

/**
 * POST /api/calendar/find-availability
 * Find mutual available time slots across multiple participants' calendars
 *
 * Request Body:
 * - participants: Array of participant objects (required)
 *   - calendarId: Calendar ID to check (required)
 *   - userId: User ID for authentication (required)
 *   - email: Participant email (optional)
 *   - displayName: Participant display name (optional)
 *   - workingHours: Working hours configuration (optional)
 *     - timezone: IANA timezone identifier (e.g., 'America/New_York')
 *     - days: Object with day names as keys (monday, tuesday, etc.)
 *       - start: HH:mm format (e.g., '09:00')
 *       - end: HH:mm format (e.g., '17:00')
 *   - isRequired: Whether participant is required (default: true)
 * - dateRange: Search range (required)
 *   - start: ISO 8601 timestamp
 *   - end: ISO 8601 timestamp
 * - duration: Meeting duration in minutes (required)
 * - bufferMinutes: Buffer time between meetings (default: 0)
 * - preferences: Time slot preferences (optional)
 *   - preferredTimeOfDay: 'morning' | 'afternoon' | 'evening' | 'any'
 *   - preferredDays: Array of day numbers (1 = Monday, 7 = Sunday)
 *   - avoidDays: Array of day numbers to avoid
 *   - preferSooner: Prefer slots closer to current date (default: true)
 *   - minQualityScore: Minimum score threshold 0-1 (optional)
 * - limit: Maximum number of suggestions to return (default: 10, max: 50)
 *
 * Response:
 * - slots: Array of available time slots with scores
 *   - start: ISO 8601 timestamp
 *   - end: ISO 8601 timestamp
 *   - score: Overall quality score (0-1)
 *   - scoreBreakdown: Detailed scoring
 *     - timeOfDay: Score for time of day preference
 *     - dayOfWeek: Score for day of week preference
 *     - proximity: Score for how soon the slot is
 *     - quality: General quality score
 *   - participants: Array of participant local times
 *     - calendarId: Participant's calendar ID
 *     - timezone: Participant's timezone
 *     - localTime: Local time representation
 *       - start: ISO 8601 in participant's timezone
 *       - end: ISO 8601 in participant's timezone
 * - searchedRange: Date range searched
 * - participantCount: Number of participants
 * - requestDuration: Requested meeting duration
 *
 * Examples:
 *
 * Basic availability search (single user, two calendars):
 * POST /api/calendar/find-availability
 * {
 *   "participants": [
 *     {
 *       "calendarId": "primary",
 *       "userId": "user-123"
 *     },
 *     {
 *       "calendarId": "work@example.com",
 *       "userId": "user-123"
 *     }
 *   ],
 *   "dateRange": {
 *     "start": "2025-01-06T00:00:00Z",
 *     "end": "2025-01-10T23:59:59Z"
 *   },
 *   "duration": 60
 * }
 *
 * Multi-participant with working hours:
 * POST /api/calendar/find-availability
 * {
 *   "participants": [
 *     {
 *       "calendarId": "primary",
 *       "userId": "user-123",
 *       "email": "user1@example.com",
 *       "workingHours": {
 *         "timezone": "America/New_York",
 *         "days": {
 *           "monday": { "start": "09:00", "end": "17:00" },
 *           "tuesday": { "start": "09:00", "end": "17:00" },
 *           "wednesday": { "start": "09:00", "end": "17:00" },
 *           "thursday": { "start": "09:00", "end": "17:00" },
 *           "friday": { "start": "09:00", "end": "17:00" }
 *         }
 *       }
 *     },
 *     {
 *       "calendarId": "primary",
 *       "userId": "user-456",
 *       "email": "user2@example.com",
 *       "workingHours": {
 *         "timezone": "America/Los_Angeles",
 *         "days": {
 *           "monday": { "start": "10:00", "end": "18:00" },
 *           "tuesday": { "start": "10:00", "end": "18:00" },
 *           "wednesday": { "start": "10:00", "end": "18:00" },
 *           "thursday": { "start": "10:00", "end": "18:00" },
 *           "friday": { "start": "10:00", "end": "18:00" }
 *         }
 *       }
 *     }
 *   ],
 *   "dateRange": {
 *     "start": "2025-01-06T00:00:00Z",
 *     "end": "2025-01-20T23:59:59Z"
 *   },
 *   "duration": 30,
 *   "bufferMinutes": 15
 * }
 *
 * With time preferences:
 * POST /api/calendar/find-availability
 * {
 *   "participants": [
 *     {
 *       "calendarId": "primary",
 *       "userId": "user-123"
 *     }
 *   ],
 *   "dateRange": {
 *     "start": "2025-01-06T00:00:00Z",
 *     "end": "2025-01-10T23:59:59Z"
 *   },
 *   "duration": 45,
 *   "preferences": {
 *     "preferredTimeOfDay": "afternoon",
 *     "preferredDays": [1, 2, 3, 4, 5],
 *     "preferSooner": true,
 *     "minQualityScore": 0.7
 *   },
 *   "limit": 5
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const currentUserId = session.user.id;

    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.participants || !Array.isArray(body.participants) || body.participants.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: participants',
          message: 'At least one participant is required',
        },
        { status: 400 }
      );
    }

    if (!body.dateRange || !body.dateRange.start || !body.dateRange.end) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: dateRange',
          message: 'Date range with start and end is required',
        },
        { status: 400 }
      );
    }

    if (!body.duration || typeof body.duration !== 'number' || body.duration <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid duration',
          message: 'Duration must be a positive number in minutes',
        },
        { status: 400 }
      );
    }

    // Validate participants
    for (const participant of body.participants) {
      if (!participant.calendarId) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid participant',
            message: 'Each participant must have a calendarId',
          },
          { status: 400 }
        );
      }

      if (!participant.userId) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid participant',
            message: 'Each participant must have a userId',
          },
          { status: 400 }
        );
      }

      // For security, only allow querying calendars the current user has access to
      // In a production app, you'd verify access permissions here
      // For now, we'll just ensure at least one participant is the current user
    }

    // Ensure at least one participant is the current user
    const hasCurrentUser = body.participants.some(
      (p: any) => p.userId === currentUserId
    );

    if (!hasCurrentUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          message: 'You must be one of the participants',
        },
        { status: 403 }
      );
    }

    // Validate limit
    const limit = Math.min(Math.max(1, body.limit || 10), 50);

    // Build availability request
    const availabilityRequest: AvailabilityRequest = {
      participants: body.participants,
      dateRange: {
        start: body.dateRange.start,
        end: body.dateRange.end,
      },
      duration: body.duration,
      bufferMinutes: body.bufferMinutes ?? 0,
      preferences: body.preferences,
      limit,
    };

    console.log('[Availability Finder] Finding availability for user:', currentUserId);
    console.log('[Availability Finder] Request:', {
      participantCount: body.participants.length,
      dateRange: body.dateRange,
      duration: body.duration,
      limit,
    });

    // Find availability
    const result = await findAvailability(availabilityRequest);

    console.log('[Availability Finder] Result:', {
      slotsFound: result.slots.length,
      topScore: result.slots[0]?.score,
    });

    // Return availability results
    return NextResponse.json({
      success: true,
      data: result,
      message: result.slots.length > 0
        ? `Found ${result.slots.length} available time slot${result.slots.length !== 1 ? 's' : ''}`
        : 'No available time slots found in the specified range',
    });
  } catch (error) {
    console.error('[Availability Finder] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to find availability',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
