# Extraction Progress System Analysis

**Date:** 2026-01-07
**Purpose:** Understanding the extraction progress tracking system for potential UI enhancements

---

## Executive Summary

The izzie2 extraction progress system tracks data extraction across three sources (email, calendar, drive) with real-time updates stored in PostgreSQL. The system supports granular progress tracking but the current UI displays limited information. This document outlines the existing architecture and identifies opportunities for enhanced progress visibility.

---

## System Architecture

### 1. Database Schema (`extraction_progress` table)

**Location:** `/src/lib/db/schema.ts` (lines 492-534)

**Key Fields:**
```typescript
{
  id: string (UUID)
  userId: string (FK to users)
  source: 'email' | 'calendar' | 'drive'
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'

  // Progress tracking
  totalItems: number          // Total items to process
  processedItems: number      // Items processed so far
  failedItems: number         // Items that failed
  entitiesExtracted: number   // Entities successfully extracted

  // Date range tracking
  oldestDateExtracted: timestamp
  newestDateExtracted: timestamp
  currentChunkStart: timestamp
  currentChunkEnd: timestamp

  // Configuration
  chunkSizeDays: number (default: 7)

  // Cost tracking
  totalCost: number (in cents)

  // Timestamps
  lastRunAt: timestamp
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Unique Constraint:** One record per (userId, source) combination

---

### 2. Progress Management API

**Location:** `/src/lib/extraction/progress.ts`

**Core Functions:**

1. **getOrCreateProgress(userId, source)** - Initialize or retrieve progress record
2. **updateProgress(userId, source, updates)** - Update progress fields
3. **startExtraction(userId, source, chunkStart, chunkEnd)** - Mark as running
4. **updateCounters(userId, source, counters)** - Update item counts
5. **completeExtraction(userId, source, options)** - Mark as completed
6. **pauseExtraction(userId, source)** - Pause extraction
7. **markExtractionError(userId, source)** - Mark as error
8. **resetProgress(userId, source)** - Clear all counters
9. **calculateProgress(progress)** - Calculate percentage: `(processedItems / totalItems) * 100`

---

### 3. Status Endpoint

**Location:** `/src/app/api/extraction/status/route.ts`

**Endpoint:** `GET /api/extraction/status`

**Response Format:**
```typescript
{
  success: true,
  progress: [
    {
      id: string,
      source: 'email' | 'calendar' | 'drive',
      status: 'idle' | 'running' | 'paused' | 'completed' | 'error',
      totalItems: number,
      processedItems: number,
      failedItems: number,
      entitiesExtracted: number,
      progressPercentage: number,  // Calculated via calculateProgress()
      oldestDateExtracted?: string,
      newestDateExtracted?: string,
      lastRunAt?: string,
      totalCost?: number (in cents)
    },
    // ... other sources
  ]
}
```

**Authentication:** Required via `requireAuth()`

---

### 4. Extraction Workflow

**Start Extraction:** `/src/app/api/extraction/start/route.ts`

1. User selects source(s) and date range in dashboard
2. POST to `/api/extraction/start` with:
   ```json
   {
     "source": "email",
     "dateRange": "30d"
   }
   ```
3. System calls `startExtraction()` to update status to 'running'
4. Triggers background sync via `/api/gmail/sync` (or calendar/drive)
5. Returns immediately (non-blocking)

**Background Sync:** `/src/app/api/gmail/sync-user/route.ts`

1. Initializes Gmail API with user OAuth tokens
2. Fetches emails in batches (100 at a time)
3. For each email:
   - Emits Inngest event `izzie/ingestion.email.extracted`
   - Increments `processedItems` counter
   - Updates progress every 10 emails via `updateCounters()`
4. On completion:
   - Calls `completeExtraction()` to mark as done
   - Final counter update with `totalItems = processedItems`

**Update Frequency:**
- Every 10 emails processed (batch updates)
- OR when `processedItems === maxResults` (final item)

**Progress Updates (Lines 316-321):**
```typescript
if (totalProcessed % 10 === 0 || totalProcessed === maxResults) {
  await updateCounters(userId, 'email', {
    processedItems: totalProcessed,
    entitiesExtracted: entitiesCount,
  });
}
```

---

### 5. Dashboard UI

**Location:** `/src/app/dashboard/page.tsx`

**Current Display (Lines 386-492):**

For each source (email, calendar, drive):
- **Status Badge**: Colored pill showing status (idle, running, paused, completed, error)
- **Progress Bar**: Visual bar showing percentage completion
- **Stats Row**:
  - Progress: `X%`
  - Items: `processedItems / totalItems`
  - Entities: `entitiesExtracted`
  - Failed: `failedItems` (shown if > 0)

**Polling Behavior (Lines 82-94):**
```typescript
useEffect(() => {
  fetchStatus(); // Initial fetch

  const interval = setInterval(() => {
    if (progress.some((p) => p.status === 'running')) {
      fetchStatus(); // Poll every 2 seconds if any source is running
    }
  }, 2000);

  return () => clearInterval(interval);
}, [progress]);
```

**Current Limitations:**
- No indication of which email is currently being processed
- No "Processing email 5 of 100" type messages
- No current item details (subject, sender, etc.)
- Progress updates delayed by batch processing (every 10 items)

---

## What Data is Available but NOT Displayed

### 1. Real-Time Progress
- **Available:** `processedItems` and `totalItems` updated every 10 emails
- **Not Shown:** Current email being processed
- **Not Shown:** Estimated time remaining
- **Not Shown:** Processing rate (emails/second)

### 2. Date Range Information
- **Available:** `currentChunkStart`, `currentChunkEnd`
- **Not Shown:** Date range of current extraction chunk
- **Not Shown:** Progress through date range

### 3. Error Details
- **Available:** `failedItems` count
- **Not Shown:** Which specific items failed
- **Not Shown:** Error messages or reasons

### 4. Cost Information
- **Available:** `totalCost` (in cents)
- **Not Shown:** Cost per item or estimated total cost

### 5. Historical Information
- **Available:** `lastRunAt`, `oldestDateExtracted`, `newestDateExtracted`
- **Partially Shown:** No timestamps or date ranges displayed

---

## Enhancement Opportunities

### 1. Granular Progress Updates

**Problem:** UI shows "Items: 10/100" but not "Processing email 11 of 100"

**Solution Options:**

**Option A: In-Memory State (Quick Win)**
- Track current item in sync function's memory
- Expose via `/api/extraction/status` endpoint
- Update: Add `currentItemIndex` and `currentItemSubject` to response
- **Pros:** No database changes, fast implementation
- **Cons:** Lost on server restart, not persisted

**Option B: Database Field (Persistent)**
- Add columns to `extraction_progress`:
  ```sql
  currentItemIndex: integer
  currentItemId: string
  currentItemSubject: string
  currentItemTimestamp: timestamp
  ```
- Update every item (not just every 10)
- **Pros:** Survives restarts, full audit trail
- **Cons:** More database writes, potential performance impact

**Recommendation:** Start with Option A for MVP, migrate to Option B if needed

---

### 2. Processing Rate & ETA

**Data Needed:**
- Start time of current batch
- Current item index
- Total items

**Calculation:**
```typescript
const elapsedSeconds = (Date.now() - startTime) / 1000;
const itemsPerSecond = processedItems / elapsedSeconds;
const remainingItems = totalItems - processedItems;
const etaSeconds = remainingItems / itemsPerSecond;
```

**Display:**
- "Processing at 2.5 emails/sec"
- "Estimated time remaining: 3m 45s"

---

### 3. Enhanced Error Reporting

**Current:** Only shows count of failed items

**Enhancement:**
- Add `extraction_errors` table:
  ```typescript
  {
    id: uuid
    progressId: uuid (FK to extraction_progress)
    itemId: string (email ID, calendar event ID, etc.)
    itemSubject: string
    errorMessage: text
    timestamp: timestamp
  }
  ```
- Display recent errors in expandable UI section
- Allow retry of individual failed items

---

### 4. Cost Tracking Display

**Available Data:** `totalCost` in cents

**Display Enhancements:**
- Show current cost: `formatCost()` already exists in progress.ts
- Show cost per item: `totalCost / processedItems`
- Estimated total cost based on current rate
- Cost breakdown by source (if extracting multiple)

---

### 5. Date Range Visualization

**Show User:**
- "Extracting emails from Dec 1, 2025 to Jan 7, 2026"
- Progress bar segmented by date chunks
- Current chunk being processed

**Data Available:**
- `currentChunkStart` / `currentChunkEnd`
- `oldestDateExtracted` / `newestDateExtracted`

---

## Implementation Recommendations

### Phase 1: Quick Wins (1-2 hours)
1. **Display current progress in real-time:**
   - Add in-memory tracking to `/api/gmail/sync-user/route.ts`
   - Update status endpoint to include `currentItemIndex` and `currentItemSubject`
   - Update dashboard to show "Processing email 15 of 100: [Subject]"

2. **Show processing rate:**
   - Calculate items/second in sync function
   - Add to status response
   - Display in dashboard: "2.5 emails/sec"

3. **Show date range:**
   - Display `currentChunkStart` to `currentChunkEnd` in dashboard
   - Format: "Extracting Dec 1 - Jan 7"

### Phase 2: Enhanced Feedback (4-6 hours)
1. **Add ETA calculation:**
   - Track sync start time
   - Calculate remaining time
   - Display: "Est. 3m 45s remaining"

2. **Cost display:**
   - Show current cost with `formatCost(totalCost)`
   - Show cost per item
   - Add cost estimator before starting extraction

3. **Better error visibility:**
   - Create expandable error section
   - Show recent errors with retry buttons
   - Link to failed item details

### Phase 3: Advanced Features (8-12 hours)
1. **Error tracking table:**
   - Create `extraction_errors` schema
   - Store individual error details
   - Build retry mechanism

2. **Real-time streaming updates:**
   - Replace polling with WebSocket or Server-Sent Events
   - Push updates immediately (not every 2 seconds)
   - Show live progress bar animation

3. **Historical analytics:**
   - Previous extraction runs
   - Cost trends over time
   - Performance metrics dashboard

---

## Technical Constraints

1. **Database Performance:**
   - Updating progress every item (vs. every 10) = 10x more writes
   - Consider batch updates with in-memory state for granular UI

2. **Polling Frequency:**
   - Current: Every 2 seconds
   - Increase frequency may impact server load
   - Consider WebSocket for sub-second updates

3. **User Token Refresh:**
   - OAuth tokens may expire during long extraction
   - System handles refresh (line 57 of sync-user/route.ts)
   - But errors are not propagated to progress tracking

4. **Inngest Events:**
   - Emails sent to Inngest for extraction (lines 288-308)
   - Entity extraction happens asynchronously
   - `entitiesExtracted` count may lag behind `processedItems`

---

## Example Enhanced UI Mockup

```
┌─────────────────────────────────────────────────────┐
│ 📧 Email                             🟢 Running     │
├─────────────────────────────────────────────────────┤
│ Processing email 47 of 100                          │
│ Subject: "Re: Q4 Planning Meeting Notes"            │
│                                                     │
│ ████████████░░░░░░░░░░░░░░░░░░ 47%                │
│                                                     │
│ Progress: 47/100 emails • Entities: 142             │
│ Rate: 2.3 emails/sec • ETA: 23 seconds              │
│ Cost: $0.12 ($0.003/email)                         │
│ Failed: 2 items (view details ▼)                   │
│                                                     │
│ Date Range: Dec 8, 2025 - Jan 7, 2026              │
│ Current Chunk: Dec 29 - Jan 5                       │
└─────────────────────────────────────────────────────┘
```

---

## Code Snippets for Quick Implementation

### 1. Add Current Item Tracking to Sync Function

```typescript
// In /src/app/api/gmail/sync-user/route.ts

// Add to syncStatus object (line 24):
let syncStatus: SyncStatus & {
  eventsSent?: number;
  currentItemIndex?: number;        // NEW
  currentItemSubject?: string;      // NEW
  currentItemTimestamp?: Date;      // NEW
  processingRate?: number;          // NEW
} = { ... };

// Update inside email processing loop (around line 310):
syncStatus.currentItemIndex = totalProcessed + 1;
syncStatus.currentItemSubject = subject;
syncStatus.currentItemTimestamp = new Date();

// Calculate processing rate
const elapsedSeconds = (Date.now() - syncStatus.lastSync!.getTime()) / 1000;
syncStatus.processingRate = totalProcessed / elapsedSeconds;
```

### 2. Update Status Endpoint Response

```typescript
// In /src/app/api/extraction/status/route.ts

// Import sync status (shared state)
import { getSyncStatus } from '@/app/api/gmail/sync-user/route';

export async function GET(request: NextRequest) {
  const syncStatus = getSyncStatus(); // Get current sync state

  const progressWithPercentage = allProgress.map((progress) => ({
    ...progress,
    progressPercentage: calculateProgress(progress),
    // NEW: Add real-time current item info
    currentItem: progress.status === 'running' ? {
      index: syncStatus.currentItemIndex,
      subject: syncStatus.currentItemSubject,
      timestamp: syncStatus.currentItemTimestamp,
      rate: syncStatus.processingRate,
      eta: calculateETA(progress, syncStatus.processingRate),
    } : undefined,
  }));

  return NextResponse.json({ success: true, progress: progressWithPercentage });
}

function calculateETA(progress: ExtractionProgress, rate?: number): number | undefined {
  if (!rate || rate === 0) return undefined;
  const remaining = progress.totalItems - progress.processedItems;
  return Math.ceil(remaining / rate); // Seconds remaining
}
```

### 3. Update Dashboard UI

```typescript
// In /src/app/dashboard/page.tsx

// Add to stats display (around line 469):
{sourceProgress && (
  <>
    <span>
      Progress: {percentage}%
    </span>

    {/* NEW: Current item info */}
    {sourceProgress.status === 'running' && sourceProgress.currentItem && (
      <div style={{
        fontSize: '0.75rem',
        color: '#4f46e5',
        marginTop: '0.5rem',
        fontStyle: 'italic'
      }}>
        Processing email {sourceProgress.currentItem.index} of {sourceProgress.totalItems}
        {sourceProgress.currentItem.subject && (
          <>: "{sourceProgress.currentItem.subject.substring(0, 50)}..."</>
        )}
      </div>
    )}

    <span>
      Items: {sourceProgress.processedItems}/{sourceProgress.totalItems}
    </span>

    {/* NEW: Processing rate */}
    {sourceProgress.currentItem?.rate && (
      <span>
        {sourceProgress.currentItem.rate.toFixed(1)} items/sec
      </span>
    )}

    {/* NEW: ETA */}
    {sourceProgress.currentItem?.eta && (
      <span>
        ETA: {formatETA(sourceProgress.currentItem.eta)}
      </span>
    )}

    <span>
      Entities: {sourceProgress.entitiesExtracted}
    </span>

    {sourceProgress.failedItems > 0 && (
      <span style={{ color: '#dc2626' }}>
        Failed: {sourceProgress.failedItems}
      </span>
    )}
  </>
)}

// Helper function:
function formatETA(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
```

---

## Conclusion

The extraction progress system has robust backend tracking with `processedItems`, `totalItems`, and `entitiesExtracted` counters updated every 10 items. The database schema supports granular tracking, but the UI currently displays only summary information.

**Key Enhancement Opportunities:**
1. **Real-time current item display** - Show "Processing email X of Y: Subject"
2. **Processing rate and ETA** - Calculate items/sec and remaining time
3. **Cost visibility** - Display current and estimated costs
4. **Error details** - Link to specific failed items with retry options
5. **Date range context** - Show which date chunk is being processed

**Recommended First Steps:**
1. Add in-memory tracking of current item to sync function
2. Expose via status endpoint
3. Update dashboard to show current item + ETA
4. Display processing rate and cost

This provides immediate user value without requiring database schema changes or major architectural shifts.
