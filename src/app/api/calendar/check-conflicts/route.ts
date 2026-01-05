/**
 * Calendar Conflict Detection API Endpoint
 * POST /api/calendar/check-conflicts - Check for scheduling conflicts
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkConflicts } from '@/lib/calendar/conflicts';
import type { ConflictCheckRequest } from '@/lib/calendar/conflicts';

/**
 * POST /api/calendar/check-conflicts
 * Check for conflicts with proposed event time
 *
 * Request Body:
 * - start: Start time { dateTime?, date?, timeZone? } (required)
 * - end: End time { dateTime?, date?, timeZone? } (required)
 * - calendarIds: Array of calendar IDs to check (optional, defaults to all)
 * - excludeEventId: Event ID to exclude from conflict check (for updates)
 * - bufferMinutes: Buffer time between events in minutes (default: 0)
 * - checkAllDayEvents: Include all-day events in conflict check (default: true)
 *
 * Response:
 * - hasConflicts: Boolean indicating if conflicts exist
 * - severity: 'none' | 'warning' | 'error'
 * - conflicts: Array of detected conflicts with details
 * - suggestedTimes: Alternative time slots (if conflicts exist)
 * - checkedCalendars: List of calendar IDs checked
 * - bufferMinutes: Buffer time used in detection
 *
 * Examples:
 *
 * Basic conflict check:
 * POST /api/calendar/check-conflicts
 * {
 *   "start": { "dateTime": "2025-01-06T14:00:00-08:00" },
 *   "end": { "dateTime": "2025-01-06T15:00:00-08:00" }
 * }
 *
 * With buffer time:
 * POST /api/calendar/check-conflicts
 * {
 *   "start": { "dateTime": "2025-01-06T14:00:00-08:00" },
 *   "end": { "dateTime": "2025-01-06T15:00:00-08:00" },
 *   "bufferMinutes": 15
 * }
 *
 * For event update (exclude current event):
 * POST /api/calendar/check-conflicts
 * {
 *   "start": { "dateTime": "2025-01-06T14:00:00-08:00" },
 *   "end": { "dateTime": "2025-01-06T15:00:00-08:00" },
 *   "excludeEventId": "event-123"
 * }
 *
 * Check specific calendars:
 * POST /api/calendar/check-conflicts
 * {
 *   "start": { "dateTime": "2025-01-06T14:00:00-08:00" },
 *   "end": { "dateTime": "2025-01-06T15:00:00-08:00" },
 *   "calendarIds": ["primary", "work@example.com"]
 * }
 *
 * All-day event:
 * POST /api/calendar/check-conflicts
 * {
 *   "start": { "date": "2025-01-15" },
 *   "end": { "date": "2025-01-16" }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.start || !body.end) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: start and end time',
          message: 'Both start and end time must be provided',
        },
        { status: 400 }
      );
    }

    // Validate EventTime format
    if (!body.start.dateTime && !body.start.date) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid start time format',
          message: 'Start time must have either dateTime or date field',
        },
        { status: 400 }
      );
    }

    if (!body.end.dateTime && !body.end.date) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid end time format',
          message: 'End time must have either dateTime or date field',
        },
        { status: 400 }
      );
    }

    // Build conflict check request
    const conflictRequest: ConflictCheckRequest = {
      start: body.start,
      end: body.end,
      calendarIds: body.calendarIds,
      excludeEventId: body.excludeEventId,
      bufferMinutes: body.bufferMinutes ?? 0,
      checkAllDayEvents: body.checkAllDayEvents ?? true,
    };

    console.log('[Conflict Check] Checking conflicts for user:', userId);
    console.log('[Conflict Check] Request:', {
      start: body.start,
      end: body.end,
      bufferMinutes: conflictRequest.bufferMinutes,
    });

    // Check for conflicts
    const result = await checkConflicts(userId, conflictRequest);

    console.log('[Conflict Check] Result:', {
      hasConflicts: result.hasConflicts,
      severity: result.severity,
      conflictCount: result.conflicts.length,
    });

    // Return conflict detection results
    return NextResponse.json({
      success: true,
      data: result,
      message: result.hasConflicts
        ? `Found ${result.conflicts.length} conflict${result.conflicts.length !== 1 ? 's' : ''}`
        : 'No conflicts detected',
    });
  } catch (error) {
    console.error('[Conflict Check] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check conflicts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
