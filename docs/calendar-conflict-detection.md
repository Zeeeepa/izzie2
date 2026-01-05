# Calendar Conflict Detection API

## Overview

The conflict detection system provides robust scheduling conflict detection with O(n log n) time complexity using a sweep line algorithm. It detects various types of conflicts including direct overlaps, double-bookings, back-to-back meetings, and recurring event conflicts.

## Features

- **Efficient Algorithm**: O(n log n) complexity using sweep line algorithm
- **Multiple Conflict Types**: Direct overlap, double-booking, back-to-back, recurring conflicts
- **Severity Levels**: Error (hard conflicts) and Warning (soft conflicts)
- **Buffer Time Support**: Configurable buffer time between meetings
- **Multi-Calendar**: Check conflicts across multiple calendars
- **Timezone-Aware**: Proper timezone handling for events
- **All-Day Events**: Optional inclusion of all-day events
- **Smart Suggestions**: Provides alternative time slots when conflicts exist
- **Event Exclusion**: Exclude specific events (useful for updates)

## API Endpoints

### POST /api/calendar/check-conflicts

Check for scheduling conflicts with a proposed event time.

#### Request Body

```typescript
{
  start: EventTime;              // Start time (required)
  end: EventTime;                // End time (required)
  calendarIds?: string[];        // Calendar IDs to check (optional)
  excludeEventId?: string;       // Event ID to exclude (optional)
  bufferMinutes?: number;        // Buffer time in minutes (default: 0)
  checkAllDayEvents?: boolean;   // Include all-day events (default: true)
}

// EventTime format
type EventTime = {
  dateTime?: string;  // RFC3339 timestamp for timed events
  date?: string;      // YYYY-MM-DD for all-day events
  timeZone?: string;  // IANA timezone (e.g., 'America/Los_Angeles')
}
```

#### Response

```typescript
{
  success: boolean;
  data: {
    hasConflicts: boolean;
    severity: 'none' | 'warning' | 'error';
    conflicts: EventConflict[];
    suggestedTimes?: Array<{
      start: string;
      end: string;
      reason: string;
    }>;
    checkedCalendars: string[];
    bufferMinutes: number;
  };
  message: string;
}

// EventConflict structure
type EventConflict = {
  type: 'direct_overlap' | 'back_to_back' | 'double_booking' | 'recurring_conflict';
  severity: 'warning' | 'error';
  conflictingEvent: CalendarEvent;
  overlapStart: string;
  overlapEnd: string;
  overlapDuration: number;  // In minutes
  message: string;
}
```

## Usage Examples

### Basic Conflict Check

Check if a proposed time has any conflicts:

```bash
curl -X POST http://localhost:3300/api/calendar/check-conflicts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "start": {
      "dateTime": "2025-01-06T14:00:00-08:00",
      "timeZone": "America/Los_Angeles"
    },
    "end": {
      "dateTime": "2025-01-06T15:00:00-08:00",
      "timeZone": "America/Los_Angeles"
    }
  }'
```

Response (no conflicts):
```json
{
  "success": true,
  "data": {
    "hasConflicts": false,
    "severity": "none",
    "conflicts": [],
    "checkedCalendars": ["primary"],
    "bufferMinutes": 0
  },
  "message": "No conflicts detected"
}
```

### Conflict with Buffer Time

Check for conflicts with 15-minute buffer between meetings:

```bash
curl -X POST http://localhost:3300/api/calendar/check-conflicts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "start": {
      "dateTime": "2025-01-06T14:00:00-08:00"
    },
    "end": {
      "dateTime": "2025-01-06T15:00:00-08:00"
    },
    "bufferMinutes": 15
  }'
```

Response (back-to-back conflict):
```json
{
  "success": true,
  "data": {
    "hasConflicts": true,
    "severity": "warning",
    "conflicts": [
      {
        "type": "back_to_back",
        "severity": "warning",
        "conflictingEvent": {
          "id": "event-123",
          "summary": "Previous Meeting",
          "start": { "dateTime": "2025-01-06T13:00:00-08:00" },
          "end": { "dateTime": "2025-01-06T14:00:00-08:00" }
        },
        "overlapStart": "2025-01-06T14:00:00-08:00",
        "overlapEnd": "2025-01-06T14:00:00-08:00",
        "overlapDuration": 0,
        "message": "Back-to-back with \"Previous Meeting\" without sufficient buffer time"
      }
    ],
    "suggestedTimes": [
      {
        "start": "2025-01-06T14:20:00-08:00",
        "end": "2025-01-06T15:20:00-08:00",
        "reason": "After conflicting event \"Previous Meeting\""
      }
    ],
    "checkedCalendars": ["primary"],
    "bufferMinutes": 15
  },
  "message": "Found 1 conflict"
}
```

### Direct Overlap Conflict

Response when events directly overlap:
```json
{
  "success": true,
  "data": {
    "hasConflicts": true,
    "severity": "error",
    "conflicts": [
      {
        "type": "direct_overlap",
        "severity": "error",
        "conflictingEvent": {
          "id": "event-456",
          "summary": "Team Standup",
          "start": { "dateTime": "2025-01-06T14:00:00-08:00" },
          "end": { "dateTime": "2025-01-06T15:00:00-08:00" }
        },
        "overlapStart": "2025-01-06T14:30:00-08:00",
        "overlapEnd": "2025-01-06T15:00:00-08:00",
        "overlapDuration": 30,
        "message": "Overlaps with \"Team Standup\" for 30 minutes"
      }
    ],
    "suggestedTimes": [
      {
        "start": "2025-01-06T13:25:00-08:00",
        "end": "2025-01-06T14:25:00-08:00",
        "reason": "Before conflicting event \"Team Standup\""
      },
      {
        "start": "2025-01-06T15:05:00-08:00",
        "end": "2025-01-06T16:05:00-08:00",
        "reason": "After conflicting event \"Team Standup\""
      }
    ],
    "checkedCalendars": ["primary"],
    "bufferMinutes": 0
  },
  "message": "Found 1 conflict"
}
```

### Update Event with Conflict Check

When updating an event, exclude the current event from conflict detection:

```bash
curl -X POST http://localhost:3300/api/calendar/check-conflicts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "start": {
      "dateTime": "2025-01-06T14:00:00-08:00"
    },
    "end": {
      "dateTime": "2025-01-06T15:00:00-08:00"
    },
    "excludeEventId": "event-to-update"
  }'
```

### Check Specific Calendars

Check conflicts only in specific calendars:

```bash
curl -X POST http://localhost:3300/api/calendar/check-conflicts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "start": {
      "dateTime": "2025-01-06T14:00:00-08:00"
    },
    "end": {
      "dateTime": "2025-01-06T15:00:00-08:00"
    },
    "calendarIds": ["primary", "work@example.com"]
  }'
```

### All-Day Event Check

Check conflicts with an all-day event:

```bash
curl -X POST http://localhost:3300/api/calendar/check-conflicts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "start": {
      "date": "2025-01-15"
    },
    "end": {
      "date": "2025-01-16"
    }
  }'
```

### Exclude All-Day Events

Check only timed events (skip all-day events):

```bash
curl -X POST http://localhost:3300/api/calendar/check-conflicts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "start": {
      "dateTime": "2025-01-06T14:00:00-08:00"
    },
    "end": {
      "dateTime": "2025-01-06T15:00:00-08:00"
    },
    "checkAllDayEvents": false
  }'
```

## Integration with Event Creation

### Create Event with Conflict Warning

Add conflict checking to event creation by adding query parameter:

```bash
curl -X POST "http://localhost:3300/api/calendar/events?checkConflicts=true&bufferMinutes=15" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "summary": "New Meeting",
    "start": {
      "dateTime": "2025-01-06T14:00:00-08:00"
    },
    "end": {
      "dateTime": "2025-01-06T15:00:00-08:00"
    }
  }'
```

Response with conflict information:
```json
{
  "success": true,
  "data": {
    "id": "new-event-123",
    "summary": "New Meeting",
    "start": { "dateTime": "2025-01-06T14:00:00-08:00" },
    "end": { "dateTime": "2025-01-06T15:00:00-08:00" }
  },
  "message": "Event created successfully",
  "conflicts": {
    "hasConflicts": true,
    "severity": "warning",
    "conflicts": [
      {
        "type": "back_to_back",
        "severity": "warning",
        "message": "Back-to-back with \"Previous Meeting\" without sufficient buffer time"
      }
    ],
    "suggestedTimes": [...]
  }
}
```

## Conflict Types

### 1. Direct Overlap
Events that overlap in time, even partially.

**Severity**: Error

**Example**: Meeting from 2:00-3:00 PM conflicts with existing meeting from 2:30-3:30 PM

### 2. Double Booking
Events scheduled at the exact same time.

**Severity**: Error

**Example**: Two meetings both scheduled for 2:00-3:00 PM

### 3. Back-to-Back
Adjacent events without sufficient buffer time.

**Severity**: Warning

**Example**: Meeting ends at 2:00 PM, next meeting starts at 2:00 PM with 15-minute buffer requirement

### 4. Recurring Conflict
Conflict with a recurring event or instance.

**Severity**: Error (if significant overlap), Warning (minor overlap)

**Example**: Proposed meeting conflicts with weekly standup

## TypeScript Usage

```typescript
import { checkConflicts } from '@/lib/calendar';
import type { ConflictCheckRequest, ConflictCheckResponse } from '@/lib/calendar';

async function checkSchedule(userId: string) {
  const request: ConflictCheckRequest = {
    start: {
      dateTime: '2025-01-06T14:00:00-08:00',
      timeZone: 'America/Los_Angeles',
    },
    end: {
      dateTime: '2025-01-06T15:00:00-08:00',
      timeZone: 'America/Los_Angeles',
    },
    bufferMinutes: 15,
  };

  const result: ConflictCheckResponse = await checkConflicts(userId, request);

  if (result.hasConflicts) {
    console.log(`Found ${result.conflicts.length} conflicts`);
    console.log(`Severity: ${result.severity}`);

    result.conflicts.forEach((conflict) => {
      console.log(`- ${conflict.message}`);
      console.log(`  Type: ${conflict.type}`);
      console.log(`  Overlap: ${conflict.overlapDuration} minutes`);
    });

    if (result.suggestedTimes) {
      console.log('Suggested alternative times:');
      result.suggestedTimes.forEach((suggestion) => {
        console.log(`- ${suggestion.start} to ${suggestion.end}`);
        console.log(`  ${suggestion.reason}`);
      });
    }
  } else {
    console.log('No conflicts! Time slot is available.');
  }
}
```

## Algorithm Details

### Sweep Line Algorithm

The conflict detection uses a sweep line algorithm for optimal performance:

1. **Filtering**: Remove excluded events, cancelled events, and transparent events
2. **Sorting**: Sort events by start time (O(n log n))
3. **Sweeping**: Iterate through sorted events, checking for overlaps
4. **Early Termination**: Stop when events start after proposed end time + buffer

**Time Complexity**: O(n log n) where n is the number of events
**Space Complexity**: O(n) for storing event intervals

### Event Filtering

The following events are automatically excluded:
- Cancelled events (status: 'cancelled')
- Transparent events (transparency: 'transparent')
- Excluded event (via excludeEventId parameter)
- All-day events (if checkAllDayEvents: false)
- Hidden/deleted calendars

### Timezone Handling

- Events with `dateTime` use ISO 8601 timestamps
- All-day events use `date` field (YYYY-MM-DD)
- Timezone is extracted from event or specified in request
- Comparisons are done in UTC to avoid timezone issues

## Performance Considerations

- **Efficient for Large Calendars**: O(n log n) algorithm handles thousands of events
- **Early Termination**: Stops checking once events are past proposed time
- **Batch Processing**: Fetches events from multiple calendars in parallel
- **Indexed Sorting**: Uses built-in sort for optimal performance

## Error Handling

### Invalid Time Range
```json
{
  "success": false,
  "error": "Failed to check conflicts",
  "message": "Event start time must be before end time"
}
```

### Missing Required Fields
```json
{
  "success": false,
  "error": "Missing required fields: start and end time",
  "message": "Both start and end time must be provided"
}
```

### Invalid EventTime Format
```json
{
  "success": false,
  "error": "Invalid start time format",
  "message": "Start time must have either dateTime or date field"
}
```

## Best Practices

### 1. Use Buffer Time for Travel
```typescript
// Recommend 15 minutes for local meetings
bufferMinutes: 15

// Recommend 30 minutes for meetings in different locations
bufferMinutes: 30
```

### 2. Check Before Scheduling
Always check conflicts before creating events to provide better UX:
```typescript
// First, check conflicts
const conflictCheck = await checkConflicts(userId, request);

if (conflictCheck.severity === 'error') {
  // Show warning to user with suggested times
  return {
    conflicts: conflictCheck.conflicts,
    suggestions: conflictCheck.suggestedTimes
  };
}

// Then create event
const event = await createEvent(userId, params);
```

### 3. Exclude Current Event for Updates
When updating an event, exclude it from conflict detection:
```typescript
const conflictCheck = await checkConflicts(userId, {
  start: newStart,
  end: newEnd,
  excludeEventId: eventId, // Exclude the event being updated
});
```

### 4. Handle Multiple Calendars
Check all relevant calendars for comprehensive conflict detection:
```typescript
const conflictCheck = await checkConflicts(userId, {
  start,
  end,
  calendarIds: ['primary', 'work@company.com', 'personal@gmail.com'],
});
```

## Related Documentation

- [Calendar API Documentation](./calendar-api.md)
- [Event Creation Guide](./calendar-api.md#create-event)
- [Timezone Handling](./calendar-api.md#timezone-support)

## Testing

Comprehensive test suite available at:
- `/src/lib/calendar/__tests__/conflicts.test.ts`

Run tests:
```bash
npm test src/lib/calendar/__tests__/conflicts.test.ts
```

## Future Enhancements

Planned improvements:
- Smart scheduling algorithm (find optimal time slots)
- Attendee availability checking
- Room/resource conflict detection
- Travel time estimation between locations
- Recurring event pattern analysis
- Machine learning for personalized buffer times
