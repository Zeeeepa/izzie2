# Calendar Availability Finder

Intelligent mutual availability finder for scheduling across multiple calendars with timezone support, working hours constraints, and preference-based scoring.

## Overview

The availability finder helps find optimal meeting times by:
- Querying free/busy status across multiple calendars
- Respecting working hours and timezone differences
- Scoring and ranking slots based on preferences
- Handling buffer time between meetings

## Architecture

### Components

```
┌─────────────────────────────────────────────────────┐
│           POST /api/calendar/find-availability      │
│                    (API Endpoint)                    │
└───────────────────┬─────────────────────────────────┘
                    │
                    v
┌─────────────────────────────────────────────────────┐
│            findAvailability()                        │
│         (src/lib/calendar/availability.ts)           │
└───────────────────┬─────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        v                       v
┌───────────────┐      ┌─────────────────┐
│  getFreeBusy  │      │ Working Hours   │
│   (Calendar)  │      │   Constraints   │
└───────────────┘      └─────────────────┘
        │                       │
        └───────────┬───────────┘
                    │
                    v
┌─────────────────────────────────────────────────────┐
│            Mutual Free Periods                       │
│    (Intersection of all participant availability)    │
└───────────────────┬─────────────────────────────────┘
                    │
                    v
┌─────────────────────────────────────────────────────┐
│         Scoring & Ranking Algorithm                  │
│  (Time of day, day of week, proximity, quality)      │
└───────────────────┬─────────────────────────────────┘
                    │
                    v
┌─────────────────────────────────────────────────────┐
│        Top N Available Slots with Scores             │
│         (Sorted by preference score)                 │
└─────────────────────────────────────────────────────┘
```

### Core Algorithm

1. **Fetch Busy Periods**: Query freeBusy API for each participant
2. **Find Free Periods**: Calculate free time between busy periods
3. **Apply Working Hours**: Filter slots by participant working hours
4. **Find Mutual Availability**: Intersect free periods across participants
5. **Score Slots**: Rank based on time of day, day of week, proximity, quality
6. **Return Top Results**: Sort by score and return top N slots

## API Usage

### Basic Request

```typescript
POST /api/calendar/find-availability

{
  "participants": [
    {
      "calendarId": "primary",
      "userId": "user-123",
      "workingHours": {
        "timezone": "America/New_York",
        "days": {
          "monday": { "start": "09:00", "end": "17:00" },
          "tuesday": { "start": "09:00", "end": "17:00" },
          "wednesday": { "start": "09:00", "end": "17:00" },
          "thursday": { "start": "09:00", "end": "17:00" },
          "friday": { "start": "09:00", "end": "17:00" }
        }
      }
    }
  ],
  "dateRange": {
    "start": "2025-01-06T00:00:00Z",
    "end": "2025-01-10T23:59:59Z"
  },
  "duration": 60,
  "limit": 10
}
```

### Response Format

```typescript
{
  "success": true,
  "data": {
    "slots": [
      {
        "start": "2025-01-06T14:00:00Z",
        "end": "2025-01-06T15:00:00Z",
        "score": 0.92,
        "scoreBreakdown": {
          "timeOfDay": 1.0,    // Perfect afternoon slot
          "dayOfWeek": 1.0,    // Monday (preferred)
          "proximity": 0.95,   // Soon (high priority)
          "quality": 0.85      // Good time (not too early/late)
        },
        "participants": [
          {
            "calendarId": "primary",
            "timezone": "America/New_York",
            "localTime": {
              "start": "2025-01-06T09:00:00-05:00",
              "end": "2025-01-06T10:00:00-05:00"
            }
          }
        ]
      }
    ],
    "searchedRange": {
      "start": "2025-01-06T00:00:00Z",
      "end": "2025-01-10T23:59:59Z"
    },
    "participantCount": 1,
    "requestDuration": 60
  },
  "message": "Found 10 available time slots"
}
```

## Features

### 1. Working Hours Support

Define custom working hours for each participant with timezone awareness:

```typescript
{
  "workingHours": {
    "timezone": "America/Los_Angeles",
    "days": {
      "monday": { "start": "10:00", "end": "18:00" },
      "wednesday": { "start": "10:00", "end": "18:00" },
      "friday": { "start": "10:00", "end": "18:00" }
      // No Tuesday/Thursday = days off
    }
  }
}
```

**Default Working Hours** (if not specified):
- Monday-Friday: 9am-5pm UTC
- Saturday-Sunday: No working hours

### 2. Multi-Timezone Support

The system handles participants across different timezones:

```typescript
{
  "participants": [
    {
      "userId": "user-1",
      "calendarId": "primary",
      "workingHours": {
        "timezone": "America/New_York",  // EST
        "days": { ... }
      }
    },
    {
      "userId": "user-2",
      "calendarId": "primary",
      "workingHours": {
        "timezone": "America/Los_Angeles",  // PST
        "days": { ... }
      }
    }
  ]
}
```

Each slot includes local times for all participants:

```typescript
{
  "start": "2025-01-06T17:00:00Z",  // UTC time
  "participants": [
    {
      "timezone": "America/New_York",
      "localTime": {
        "start": "2025-01-06T12:00:00-05:00"  // Noon EST
      }
    },
    {
      "timezone": "America/Los_Angeles",
      "localTime": {
        "start": "2025-01-06T09:00:00-08:00"  // 9am PST
      }
    }
  ]
}
```

### 3. Buffer Time

Add buffer time between meetings to prevent back-to-back scheduling:

```typescript
{
  "duration": 60,          // 1-hour meeting
  "bufferMinutes": 15      // 15-minute buffer after
}
```

This ensures:
- Meetings don't start within 15 minutes of existing events ending
- Travel time or preparation time is accounted for
- No back-to-back exhaustion

### 4. Time Preferences

Customize slot preferences for optimal scheduling:

```typescript
{
  "preferences": {
    "preferredTimeOfDay": "afternoon",  // morning | afternoon | evening | any
    "preferredDays": [1, 2, 3, 4, 5],  // Mon-Fri (1=Monday, 7=Sunday)
    "avoidDays": [6, 7],                // Avoid weekends
    "preferSooner": true,               // Prioritize closer dates
    "minQualityScore": 0.7              // Filter low-quality slots
  }
}
```

### 5. Intelligent Scoring

Slots are scored on four dimensions (0-1 scale):

#### Time of Day Score
- **Morning** preference: 8am-12pm = 1.0, 7am-8am = 0.8, 12pm-1pm = 0.7, other = 0.3
- **Afternoon** preference: 1pm-5pm = 1.0, 12pm-1pm = 0.8, 5pm-6pm = 0.7, other = 0.3
- **Evening** preference: 5pm-8pm = 1.0, 4pm-5pm = 0.8, 8pm-9pm = 0.7, other = 0.3
- **Any**: 1.0 for all times

#### Day of Week Score
- Preferred days = 1.0
- Non-preferred weekdays = 0.5
- Avoided days = 0.2
- Default: Weekdays = 1.0, Weekends = 0.5

#### Proximity Score (if preferSooner = true)
- 0-7 days out: 1.0 → 0.7 (linear)
- 7-30 days out: 0.7 → 0.3 (linear)
- 30+ days out: 0.3

#### Quality Score
- Very early (<7am) or late (>8pm): 0.3
- Somewhat early (7am-8am) or late (7pm-8pm): 0.7
- Good time (8am-7pm): 1.0

**Overall Score** (weighted average):
```
score = timeOfDay * 0.35 + dayOfWeek * 0.25 + proximity * 0.15 + quality * 0.25
```

## Implementation Details

### File Structure

```
src/lib/calendar/
├── availability.ts         # Core availability finder
├── index.ts               # Calendar service (freeBusy API)
├── conflicts.ts           # Conflict detection
└── types.ts              # TypeScript types

src/app/api/calendar/
└── find-availability/
    └── route.ts          # API endpoint

tests/calendar/
└── availability.test.ts  # Comprehensive test suite (21 tests)
```

### Key Functions

#### `findAvailability(request: AvailabilityRequest): Promise<AvailabilityResponse>`

Main entry point for availability search.

**Parameters:**
- `participants`: Array of participant objects with calendar IDs and working hours
- `dateRange`: Start and end dates for search
- `duration`: Meeting duration in minutes
- `bufferMinutes`: Optional buffer time (default: 0)
- `preferences`: Optional time preferences
- `limit`: Max results to return (default: 10)

**Returns:**
- `slots`: Array of available slots with scores
- `searchedRange`: Date range searched
- `participantCount`: Number of participants
- `requestDuration`: Requested duration

#### Helper Functions

- `isWithinWorkingHours(date, workingHours)`: Check if time falls within working hours
- `mergeBusyPeriods(periods)`: Merge overlapping busy periods
- `findFreePeriods(range, busyPeriods, duration)`: Find free time slots
- `findMutualFreePeriods(participantFreePeriods)`: Intersect free periods
- `filterByWorkingHours(periods, participants)`: Apply working hours constraints
- `scoreSlot(slot, preferences)`: Calculate preference score

### Performance Considerations

#### Time Complexity
- Sorting busy periods: O(n log n) where n = busy events
- Finding free periods: O(n) per participant
- Finding mutual availability: O(p × m) where p = participants, m = free periods
- Overall: O(p × n log n + p × m)

#### Space Complexity
- O(p × n) for storing busy periods and free periods

#### Optimization Strategies
1. **Early Termination**: Stop generating slots once limit is reached
2. **15-Minute Increments**: Balance granularity with performance
3. **Merged Busy Periods**: Reduce redundant checks
4. **Filtered Results**: Apply minQualityScore to reduce result set

## Use Cases

### 1. Single User, Multiple Calendars

Find time across personal and work calendars:

```typescript
{
  "participants": [
    { "calendarId": "primary", "userId": "user-123" },
    { "calendarId": "work@company.com", "userId": "user-123" }
  ],
  "dateRange": { "start": "...", "end": "..." },
  "duration": 60
}
```

### 2. Cross-Timezone Team Meeting

Schedule across US timezones:

```typescript
{
  "participants": [
    {
      "userId": "user-east",
      "calendarId": "primary",
      "workingHours": { "timezone": "America/New_York", ... }
    },
    {
      "userId": "user-central",
      "calendarId": "primary",
      "workingHours": { "timezone": "America/Chicago", ... }
    },
    {
      "userId": "user-west",
      "calendarId": "primary",
      "workingHours": { "timezone": "America/Los_Angeles", ... }
    }
  ],
  "duration": 60,
  "preferences": {
    "preferredTimeOfDay": "afternoon",
    "minQualityScore": 0.8
  }
}
```

### 3. Client Meeting with Buffer

Schedule with travel/prep time:

```typescript
{
  "participants": [
    { "userId": "sales-rep", "calendarId": "primary" },
    { "userId": "client", "calendarId": "client@external.com" }
  ],
  "duration": 45,
  "bufferMinutes": 15,  // 15 min before/after
  "preferences": {
    "preferredDays": [2, 3, 4],  // Tue-Thu
    "preferSooner": true
  }
}
```

### 4. Recurring Meeting Slot

Find best weekly slot:

```typescript
{
  "participants": [ ... ],
  "dateRange": {
    "start": "2025-01-06T00:00:00Z",  // Monday
    "end": "2025-01-10T23:59:59Z"     // Friday
  },
  "duration": 30,
  "preferences": {
    "preferredDays": [1],  // Mondays only
    "preferredTimeOfDay": "morning"
  }
}
```

## Error Handling

The service handles common errors gracefully:

### Validation Errors (400)

```typescript
{
  "success": false,
  "error": "Invalid duration",
  "message": "Duration must be a positive number in minutes"
}
```

### Authorization Errors (403)

```typescript
{
  "success": false,
  "error": "Unauthorized",
  "message": "You must be one of the participants"
}
```

### Service Errors (500)

```typescript
{
  "success": false,
  "error": "Failed to find availability",
  "message": "API error from calendar service"
}
```

## Testing

Comprehensive test suite with 21 tests covering:

1. **Basic Functionality**
   - Finding available slots
   - Respecting duration and limits
   - Working hours constraints

2. **Busy Period Handling**
   - Avoiding busy periods
   - Multiple busy periods
   - Buffer time

3. **Multi-Participant**
   - Mutual availability
   - Cross-timezone support

4. **Scoring**
   - Time of day preferences
   - Day of week preferences
   - Quality filtering
   - Score breakdown

5. **Error Handling**
   - Invalid inputs
   - API errors
   - Edge cases

Run tests:
```bash
npm test tests/calendar/availability.test.ts
```

## Future Enhancements

### Potential Improvements

1. **Smart Recurrence Detection**
   - Suggest optimal recurring meeting times
   - Analyze historical patterns

2. **Meeting Room Integration**
   - Include room availability
   - Consider location/travel time

3. **Attendee Preferences**
   - Learn from past scheduling patterns
   - Personalized scoring weights

4. **Advanced Constraints**
   - Maximum meetings per day
   - Minimum time between meetings
   - Focus time blocks

5. **Calendar Sync**
   - Support for multiple calendar providers (Outlook, iCal)
   - Real-time updates

6. **Machine Learning**
   - Predict best meeting times
   - Optimize for productivity patterns

## Integration with Scheduling Agent (#25)

This availability finder provides the foundation for the scheduling agent:

```
User Request
     ↓
[Scheduling Agent] ← Uses availability finder
     ↓
Available Slots
     ↓
[Agent presents options]
     ↓
User selects slot
     ↓
[Agent creates event]
```

The agent will:
1. Parse natural language requests ("Find time this week for 30-minute meeting")
2. Call `findAvailability()` with appropriate parameters
3. Present top slots to user
4. Handle confirmation and event creation

## Related Documentation

- [Calendar Integration](./calendar-integration.md)
- [Conflict Detection](./calendar-conflicts.md)
- [Scheduling Agent Architecture](./scheduling-agent.md)

## References

- [Google Calendar API - FreeBusy](https://developers.google.com/calendar/api/v3/reference/freebusy)
- [IANA Time Zone Database](https://www.iana.org/time-zones)
- [ISO 8601 Date/Time Format](https://en.wikipedia.org/wiki/ISO_8601)
