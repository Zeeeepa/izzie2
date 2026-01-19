# Extraction Status System - Quick Reference

## API Endpoints

### Get Extraction Status
```
GET /api/extraction/status
```

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "progress": [
    {
      "source": "email",
      "status": "running",           // Effective status (stale marked as error)
      "originalStatus": "running",   // Original DB status (for debugging)
      "totalItems": 100,
      "processedItems": 50,
      "progressPercentage": 50,
      "processingRate": 2.5,         // Items per second
      "estimatedSecondsRemaining": 20,
      "lastRunAt": "2026-01-18T22:00:00.000Z"
    }
  ]
}
```

### Start Extraction
```
POST /api/extraction/start
```

**Body**:
```json
{
  "source": "email",    // "email" | "calendar" | "drive"
  "dateRange": "30d"    // "7d" | "30d" | "90d" | "all"
}
```

### Reset Stale Extractions
```
POST /api/extraction/reset-stale
```

**Purpose**: Manually reset stuck extractions

**Response**:
```json
{
  "success": true,
  "message": "Reset 2 stale extractions",
  "resetCount": 2
}
```

## Extraction Status Values

| Status | Meaning | Can Start New? |
|--------|---------|---------------|
| `idle` | Not started | ✅ Yes |
| `running` | Currently active | ❌ No |
| `paused` | Manually paused | ✅ Yes |
| `completed` | Finished successfully | ✅ Yes |
| `error` | Failed or stale | ✅ Yes |

## Stale Detection Rules

An extraction is considered **stale** if:
- Status is `running` AND
- (`lastRunAt` is NULL OR last activity > 5 minutes ago)

**Stale extractions**:
- Are marked as `error` by the status API (effective status)
- Are automatically reset on server startup
- Can be manually reset via `/api/extraction/reset-stale`

## Code Usage

### Check if Extraction is Stale
```typescript
import { isExtractionStale } from '@/lib/extraction/progress';

const progress = await getOrCreateProgress(userId, 'email');

if (isExtractionStale(progress)) {
  console.log('Extraction is stuck!');
}
```

### Get Effective Status
```typescript
import { getEffectiveStatus } from '@/lib/extraction/progress';

const effectiveStatus = getEffectiveStatus(progress);
// Returns 'error' for stale extractions, otherwise returns actual status
```

### Reset Stale Extractions
```typescript
import { resetStaleExtractions } from '@/lib/extraction/progress';

// Reset all stale extractions across all users
const resetCount = await resetStaleExtractions();
console.log(`Reset ${resetCount} stale extraction(s)`);
```

### Update Progress During Sync
```typescript
import {
  updateCounters,
  completeExtraction,
  markExtractionError
} from '@/lib/extraction/progress';

// During sync
await updateCounters(userId, 'email', {
  totalItems: 100,
  processedItems: 50,
});

// On success
await completeExtraction(userId, 'email', {
  oldestDate: startDate,
  newestDate: endDate,
});

// On error
await markExtractionError(userId, 'email');
```

## Database Schema

```sql
CREATE TABLE extraction_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,              -- 'email' | 'calendar' | 'drive'
  status TEXT NOT NULL DEFAULT 'idle', -- 'idle' | 'running' | 'paused' | 'completed' | 'error'

  -- Watermarks
  oldest_date_extracted TIMESTAMP,
  newest_date_extracted TIMESTAMP,

  -- Progress counters
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,

  -- Chunk configuration
  chunk_size_days INTEGER DEFAULT 7,
  current_chunk_start TIMESTAMP,
  current_chunk_end TIMESTAMP,

  -- Stats
  entities_extracted INTEGER DEFAULT 0,
  total_cost INTEGER DEFAULT 0,     -- Cost in cents

  -- Timestamps
  last_run_at TIMESTAMP,             -- Used for stale detection
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

## Automatic Cleanup

**On Server Startup** (`src/instrumentation.ts`):
- Automatically resets all stale extractions
- Logs count of reset extractions
- Runs once when Next.js server starts

**On Status API Call** (`/api/extraction/status`):
- Calculates effective status (marks stale as error)
- Does NOT modify database
- Returns accurate status to UI

## Testing

### Run Test Script
```bash
npx tsx scripts/test-stuck-extraction.ts
```

**What it does**:
1. Creates a stuck extraction (running for 10+ minutes)
2. Tests stale detection
3. Tests reset functionality
4. Verifies database state

### Manual Testing
```bash
# Check current status
npx tsx -e "
import { dbClient } from '@/lib/db';
import { extractionProgress } from '@/lib/db/schema';
const db = dbClient.getDb();
const all = await db.select().from(extractionProgress);
console.log(all);
await dbClient.close();
"

# Reset stale extractions
curl -X POST http://localhost:3300/api/extraction/reset-stale \
  -H "Cookie: your-auth-cookie"
```

## Troubleshooting

### Dashboard shows "running" but no progress
**Cause**: Stale extraction not detected yet
**Solution**:
- Wait for next server restart (automatic reset)
- OR manually reset: `POST /api/extraction/reset-stale`

### Extraction stuck for hours
**Cause**: Background sync failed but status not updated
**Solution**:
- Check server logs for errors
- Reset via API: `POST /api/extraction/reset-stale`
- Retry extraction: `POST /api/extraction/start`

### Status API returns different status than database
**Expected**: Status API returns *effective* status (marks stale as error)
**Database**: Contains *original* status (may be "running")
**This is normal**: UI sees accurate status without database writes

## Related Files

- Core logic: `src/lib/extraction/progress.ts`
- Status API: `src/app/api/extraction/status/route.ts`
- Reset endpoint: `src/app/api/extraction/reset-stale/route.ts`
- Startup cleanup: `src/instrumentation.ts`
- Calendar sync: `src/app/api/calendar/sync/route.ts`
- Test script: `scripts/test-stuck-extraction.ts`
