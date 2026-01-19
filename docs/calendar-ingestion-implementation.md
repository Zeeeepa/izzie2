# Google Calendar Events Ingestion - Implementation Summary

**Status:** ✅ Complete
**Date:** 2026-01-06

## Overview

Added Google Calendar events ingestion to extract entities from calendar events, following the existing email and Drive ingestion patterns.

## Files Created

### 1. API Routes

#### `/src/app/api/calendar/sync/route.ts`
- **Purpose:** Background sync endpoint for calendar events
- **Methods:**
  - `POST` - Start calendar sync (non-blocking)
  - `GET` - Get sync status
- **Parameters:**
  - `maxResults` (default: 100) - Max events to fetch
  - `daysPast` (default: 30) - Days in past to fetch
  - `daysFuture` (default: 30) - Days in future to fetch
  - `userEmail` - User to impersonate (optional)
- **Flow:**
  1. Authenticate with Google Calendar API
  2. Fetch events from primary calendar
  3. Emit `izzie/ingestion.calendar.extracted` events for processing
  4. Return sync status

#### `/src/app/api/test/batch-extract-calendar/route.ts`
- **Purpose:** Test endpoint for full calendar extraction pipeline
- **Method:** `POST`
- **Parameters:**
  - `maxEvents` (default: 20)
  - `userId` (default: 'bob@matsuoka.com')
  - `daysPast` (default: 30)
  - `daysFuture` (default: 30)
- **Flow:**
  1. Fetch calendar events
  2. Extract entities using AI
  3. Store in `memory_entries` table
  4. Return summary with costs and entity counts

### 2. Calendar Service

#### `/src/lib/google/calendar.ts`
- **Purpose:** Google Calendar API wrapper
- **Methods:**
  - `fetchEvents()` - Fetch events with time range and pagination
  - `getEvent()` - Get single event by ID
  - `parseDateTime()` - Parse Calendar API date/time format
- **Features:**
  - Automatic expansion of recurring events
  - Attendee and organizer information
  - Location and description extraction

### 3. Type Definitions

#### `/src/lib/google/types.ts` (updated)
Added Calendar types:
- `CalendarAttendee` - Event attendee with RSVP status
- `CalendarOrganizer` - Event organizer information
- `CalendarEvent` - Full event data structure
- `CalendarEventBatch` - Batch fetch results with pagination

#### `/src/lib/events/types.ts` (updated)
- Added `CalendarEventExtractedSchema` for Inngest events
- Updated `EntitiesExtractedSchema` to support `sourceType: 'calendar'`
- Added `izzie/ingestion.calendar.extracted` event type
- Updated validation schemas

### 4. Entity Extraction

#### `/src/lib/extraction/entity-extractor.ts` (updated)
Added methods:
- `extractFromCalendarEvent()` - Extract entities from single event
- `extractBatchCalendar()` - Batch extraction with progress tracking

#### `/src/lib/extraction/types.ts` (updated)
- Added `CalendarExtractionResult` interface

#### `/src/lib/extraction/prompts.ts` (updated)
- Added `buildCalendarExtractionPrompt()` for calendar-specific extraction
- Extracts from: summary, description, location, attendees, organizer
- Entity types: people, companies, projects, dates, topics, locations, action_items

### 5. Inngest Functions

#### `/src/lib/events/functions/ingest-calendar.ts`
- **Purpose:** Scheduled function to ingest calendar events
- **Schedule:** Every 6 hours (`0 */6 * * *`)
- **Flow:**
  1. Get sync state from database
  2. Fetch events from 30 days ago to 60 days future
  3. Emit events for entity extraction
  4. Update sync state

#### `/src/lib/events/functions/extract-entities.ts` (updated)
- Added `extractEntitiesFromCalendar()` function
- Listens for `izzie/ingestion.calendar.extracted` events
- Extracts entities and emits `izzie/ingestion.entities.extracted` event

#### `/src/lib/events/functions/index.ts` (updated)
- Exported `ingestCalendar` and `extractEntitiesFromCalendar`
- Added to `functions` array for Inngest serve handler

### 6. Authentication

#### `/src/lib/google/auth.ts` (updated)
- Added `https://www.googleapis.com/auth/calendar.readonly` scope

## Entity Types Extracted from Calendar Events

1. **person** - Attendees, organizer, mentioned in description
2. **company** - Organizations mentioned in title or description
3. **project** - Project names referenced
4. **date** - Important dates/deadlines mentioned in description
5. **topic** - Meeting topics and discussion areas
6. **location** - Geographic locations, meeting rooms, addresses
7. **action_item** - Tasks and todos mentioned in description

## Testing

### Test the Batch Extract Endpoint

```bash
curl -X POST http://localhost:3000/api/test/batch-extract-calendar \
  -H "Content-Type: application/json" \
  -d '{
    "maxEvents": 10,
    "userId": "bob@matsuoka.com",
    "daysPast": 30,
    "daysFuture": 30
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "summary": {
    "eventsFetched": 10,
    "eventsProcessed": 10,
    "entriesStored": 8,
    "totalEntities": 45,
    "totalCost": 0.000523,
    "costPerEvent": 0.000052,
    "entitiesPerEvent": 4.5,
    "entityTypeCounts": {
      "person": 20,
      "location": 10,
      "topic": 8,
      "date": 4,
      "action_item": 3
    }
  },
  "results": [...]
}
```

### Test the Sync Endpoint

```bash
# Start sync
curl -X POST http://localhost:3000/api/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{
    "maxResults": 50,
    "daysPast": 30,
    "daysFuture": 30,
    "userEmail": "bob@matsuoka.com"
  }'

# Check status
curl http://localhost:3000/api/calendar/sync
```

### Verify Database Storage

```sql
-- Check calendar event entries
SELECT
  id,
  summary,
  metadata->>'source' as source,
  metadata->>'eventId' as event_id,
  metadata->>'summary' as event_summary,
  metadata->>'entityCount' as entity_count,
  created_at
FROM memory_entries
WHERE metadata->>'source' = 'calendar_extraction'
ORDER BY created_at DESC
LIMIT 10;

-- Check entity types extracted
SELECT
  metadata->>'entityTypes' as entity_types,
  COUNT(*) as count
FROM memory_entries
WHERE metadata->>'source' = 'calendar_extraction'
GROUP BY metadata->>'entityTypes';
```

## Integration with Existing System

### Inngest Event Flow

```
1. Scheduled Cron (every 6 hours)
   ↓
2. ingestCalendar function
   ↓
3. Emit 'izzie/ingestion.calendar.extracted' events
   ↓
4. extractEntitiesFromCalendar function
   ↓
5. Extract entities using AI (Mistral Small)
   ↓
6. Emit 'izzie/ingestion.entities.extracted' event
   ↓
7. updateGraph function (existing)
   ↓
8. Store in Neo4j graph database
```

### Database Schema

Entities stored in `memory_entries` table with metadata:
```json
{
  "source": "calendar_extraction",
  "eventId": "event_id_123",
  "summary": "Team Meeting",
  "start": "2026-01-07T10:00:00Z",
  "end": "2026-01-07T11:00:00Z",
  "location": "Conference Room A",
  "attendees": [
    {"email": "alice@example.com", "displayName": "Alice"},
    {"email": "bob@example.com", "displayName": "Bob"}
  ],
  "entities": [...],
  "extractionModel": "mistralai/mistral-small",
  "extractionCost": 0.000052,
  "entityTypes": ["person", "location", "topic"],
  "entityCount": 5
}
```

## Cost Estimation

- **Model:** Mistral Small (cheap tier)
- **Cost per event:** ~$0.00005 (0.005 cents)
- **100 events:** ~$0.005
- **1000 events/month:** ~$0.05

## Configuration Required

### Environment Variables
Already configured in existing setup:
- `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` - Service account credentials
- `GOOGLE_OAUTH_CLIENT_ID` - OAuth client ID (if using OAuth)
- `GOOGLE_OAUTH_CLIENT_SECRET` - OAuth client secret (if using OAuth)

### Google Workspace Domain-wide Delegation
Calendar API scope already added to auth:
- `https://www.googleapis.com/auth/calendar.readonly`

Ensure this scope is authorized in Google Workspace Admin Console for the service account.

## Known Limitations

1. **Read-only access** - Only fetches events, cannot create/update/delete
2. **Primary calendar only** - Fetches from primary calendar (can be extended)
3. **Single-events expansion** - Recurring events are expanded (may fetch many instances)
4. **No attachment handling** - Calendar attachments not processed
5. **Sync state basic** - Uses existing sync state infrastructure (no incremental sync token yet)

## Future Enhancements

1. **Incremental sync** - Use Calendar API sync tokens for efficient updates
2. **Multiple calendars** - Support fetching from multiple calendars
3. **Attachment extraction** - Extract entities from meeting attachments
4. **Meeting notes integration** - Link to Google Docs meeting notes
5. **Conflict detection** - Identify scheduling conflicts
6. **Availability analysis** - Analyze free/busy patterns

## Files Modified Summary

- ✅ Created: `/src/app/api/calendar/sync/route.ts`
- ✅ Created: `/src/app/api/test/batch-extract-calendar/route.ts`
- ✅ Created: `/src/lib/google/calendar.ts`
- ✅ Created: `/src/lib/events/functions/ingest-calendar.ts`
- ✅ Updated: `/src/lib/google/types.ts` (added Calendar types)
- ✅ Updated: `/src/lib/google/auth.ts` (added Calendar scope)
- ✅ Updated: `/src/lib/events/types.ts` (added Calendar event schemas)
- ✅ Updated: `/src/lib/extraction/entity-extractor.ts` (added calendar methods)
- ✅ Updated: `/src/lib/extraction/types.ts` (added CalendarExtractionResult)
- ✅ Updated: `/src/lib/extraction/prompts.ts` (added calendar prompt)
- ✅ Updated: `/src/lib/events/functions/extract-entities.ts` (added calendar handler)
- ✅ Updated: `/src/lib/events/functions/index.ts` (exported calendar functions)

## Next Steps

1. **Test with real calendar data** - Run batch extract endpoint
2. **Verify entity extraction quality** - Check extracted entities make sense
3. **Monitor costs** - Track AI extraction costs
4. **Deploy to production** - Enable scheduled ingestion
5. **Add to monitoring** - Track sync failures and entity counts
