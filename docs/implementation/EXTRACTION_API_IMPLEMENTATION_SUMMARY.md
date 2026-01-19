# Extraction API Implementation Summary

## Files Created

### API Endpoints

1. **`src/app/api/extraction/status/route.ts`** (1.5 KB)
   - GET endpoint for retrieving extraction progress
   - Returns progress for all sources (email, calendar, drive)
   - Includes calculated progress percentage
   - Requires authentication

2. **`src/app/api/extraction/start/route.ts`** (4.9 KB)
   - POST endpoint for starting extraction
   - Accepts source and dateRange parameters
   - Validates extraction state before starting
   - Triggers background sync via existing endpoints
   - Supports date ranges: 7d, 30d, 90d, all
   - Requires authentication

3. **`src/app/api/extraction/pause/route.ts`** (2.2 KB)
   - POST endpoint for pausing extraction
   - Validates that extraction is actually running
   - Updates progress status to 'paused'
   - Requires authentication

4. **`src/app/api/extraction/reset/route.ts`** (2.8 KB)
   - POST endpoint for resetting extraction progress
   - Clears all counters and dates
   - Optional entity deletion via clearEntities flag
   - Sets status back to 'idle'
   - Requires authentication

### Documentation

5. **`EXTRACTION_API_ENDPOINTS.md`**
   - Complete API documentation
   - Request/response schemas
   - Error handling
   - Usage examples with curl commands
   - Integration point descriptions

6. **`scripts/test-extraction-api.ts`**
   - Test script for all endpoints
   - Validates request/response handling
   - Tests authentication requirements
   - Tests input validation

## Key Features

### Authentication
- All endpoints use `requireAuth()` from `@/lib/auth`
- Returns 401 Unauthorized if not authenticated
- Automatically extracts user ID from session

### Progress Tracking
- Uses utilities from `@/lib/extraction/progress.ts`
- Supports three sources: email, calendar, drive
- Tracks: total items, processed, failed, entities extracted
- Maintains date watermarks (oldest/newest extracted)
- Tracks cost in cents

### State Management
Valid status transitions:
- idle → running (via start)
- running → paused (via pause)
- running → completed (automatic by sync process)
- running → error (automatic on failure)
- paused → running (via start)
- completed → running (via start)
- Any status → idle (via reset)

### Date Ranges
- `7d` - Last 7 days
- `30d` - Last 30 days (default)
- `90d` - Last 90 days
- `all` - Last 1 year

### Integration
The start endpoint triggers existing sync endpoints:

1. **Email** → `/api/gmail/sync`
   - Uses 'sent' folder (high-signal data)
   - maxResults: 500
   - Passes ISO date as 'since' parameter

2. **Calendar** → `/api/calendar/sync`
   - Converts date range to daysPast parameter
   - maxResults: 500
   - daysFuture: 30 (hardcoded)

3. **Drive** → Not yet implemented
   - Returns error if attempted

## Error Handling

All endpoints return consistent JSON responses:

```typescript
{
  success: boolean;
  error?: string;
  progress?: ExtractionProgress;
  message?: string;
}
```

HTTP status codes:
- 200 - Success
- 400 - Bad request (invalid parameters)
- 401 - Unauthorized (missing/invalid auth)
- 409 - Conflict (invalid state transition)
- 500 - Internal server error

## Testing

Run test script:
```bash
npx tsx scripts/test-extraction-api.ts
```

Expected behavior without auth:
- All endpoints return 401 Unauthorized
- Input validation still works (400 for invalid params)

With authentication:
- Status endpoint returns all progress records
- Start endpoint validates state and triggers sync
- Pause endpoint only works if status='running'
- Reset endpoint clears all data

## Usage Flow

1. **Check current status**
   ```bash
   GET /api/extraction/status
   ```

2. **Start extraction**
   ```bash
   POST /api/extraction/start
   { "source": "email", "dateRange": "30d" }
   ```

3. **Monitor progress** (poll status endpoint)
   ```bash
   GET /api/extraction/status
   ```

4. **Pause if needed**
   ```bash
   POST /api/extraction/pause
   { "source": "email" }
   ```

5. **Resume by starting again**
   ```bash
   POST /api/extraction/start
   { "source": "email", "dateRange": "7d" }
   ```

6. **Reset to start over**
   ```bash
   POST /api/extraction/reset
   { "source": "email", "clearEntities": true }
   ```

## Next Steps

To complete the extraction UI:

1. **Create frontend components**
   - Progress bars for each source
   - Start/pause/reset buttons
   - Date range selector
   - Real-time progress updates

2. **Add polling or WebSocket**
   - Poll `/api/extraction/status` every 5 seconds
   - Or use WebSocket for real-time updates

3. **Add Drive extraction**
   - Implement `/api/drive/sync` endpoint
   - Update start endpoint to support drive

4. **Add cost tracking UI**
   - Display total cost per source
   - Show cost estimates before starting

5. **Add notifications**
   - Email when extraction completes
   - Browser notifications for status changes

## LOC Delta

**Added:**
- status/route.ts: 55 lines
- start/route.ts: 185 lines
- pause/route.ts: 82 lines
- reset/route.ts: 96 lines
- test-extraction-api.ts: 120 lines
- **Total: 538 lines**

**Removed:** 0 lines (new functionality)

**Net Change:** +538 lines

All code follows Next.js 15 App Router patterns with Server Components, proper error handling, and TypeScript type safety.
