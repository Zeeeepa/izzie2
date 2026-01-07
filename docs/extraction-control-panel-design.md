# Extraction Control Panel Design

**Project:** Izzie2 - Personal AI Assistant
**Date:** 2026-01-07
**Purpose:** Control panel for managing data extraction from Email, Calendar, and Google Drive

---

## Overview

The extraction control panel provides users with visibility and control over data ingestion from various sources (Gmail, Google Calendar, Google Drive). It supports:

1. **Watermark tracking** - Track extraction progress and date ranges
2. **Reset/redo capability** - Re-extract specific date ranges
3. **Chunked processing** - Extract data in configurable time chunks (1 week, 1 month)
4. **Progress visualization** - Real-time progress bars and statistics
5. **Multi-source support** - Unified interface for Email, Calendar, and Drive

---

## 1. Database Schema

### 1.1 `extraction_progress` Table

Tracks extraction progress for each data source per user.

```typescript
// src/lib/db/schema.ts

export const extractionProgress = pgTable(
  'extraction_progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Source type
    source: text('source').notNull(), // 'gmail', 'calendar', 'drive'

    // Watermark tracking (date-based)
    oldestDateExtracted: timestamp('oldest_date_extracted'), // How far back we've gone
    newestDateExtracted: timestamp('newest_date_extracted'), // Most recent item

    // Progress tracking
    totalItems: integer('total_items').default(0).notNull(),
    processedItems: integer('processed_items').default(0).notNull(),
    failedItems: integer('failed_items').default(0).notNull(),

    // Chunk processing
    currentChunkStart: timestamp('current_chunk_start'),
    currentChunkEnd: timestamp('current_chunk_end'),
    chunkSize: text('chunk_size').default('1_week').notNull(), // '1_week', '1_month', '3_months'

    // Status
    status: text('status').default('idle').notNull(), // 'idle', 'running', 'paused', 'error', 'completed'

    // Timestamps
    lastRunAt: timestamp('last_run_at'),
    lastSuccessAt: timestamp('last_success_at'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),

    // Error tracking
    lastError: text('last_error'),
    errorCount: integer('error_count').default(0).notNull(),

    // Cost tracking
    totalCost: integer('total_cost').default(0).notNull(), // in cents (USD)
    totalTokens: integer('total_tokens').default(0).notNull(),

    // Metadata
    metadata: jsonb('metadata').$type<{
      entitiesExtracted?: number;
      averageEntitiesPerItem?: number;
      pageTokens?: string[]; // For resuming pagination
      historyIds?: string[]; // Gmail-specific
      syncTokens?: string[]; // Calendar-specific
      [key: string]: unknown;
    }>(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('extraction_progress_user_id_idx').on(table.userId),
    sourceIdx: index('extraction_progress_source_idx').on(table.source),
    statusIdx: index('extraction_progress_status_idx').on(table.status),
    userSourceUnique: index('extraction_progress_user_source_unique').on(
      table.userId,
      table.source
    ),
  })
);

export type ExtractionProgress = typeof extractionProgress.$inferSelect;
export type NewExtractionProgress = typeof extractionProgress.$inferInsert;
```

### 1.2 `extraction_chunks` Table

Tracks individual chunk processing history for detailed progress and retry logic.

```typescript
export const extractionChunks = pgTable(
  'extraction_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    progressId: uuid('progress_id')
      .references(() => extractionProgress.id, { onDelete: 'cascade' })
      .notNull(),

    // Chunk definition
    chunkStart: timestamp('chunk_start').notNull(),
    chunkEnd: timestamp('chunk_end').notNull(),
    chunkNumber: integer('chunk_number').notNull(), // Sequential ordering

    // Processing stats
    itemsFound: integer('items_found').default(0).notNull(),
    itemsProcessed: integer('items_processed').default(0).notNull(),
    itemsFailed: integer('items_failed').default(0).notNull(),

    // Status
    status: text('status').default('pending').notNull(), // 'pending', 'processing', 'completed', 'failed'

    // Timestamps
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),

    // Error tracking
    error: text('error'),
    retryCount: integer('retry_count').default(0).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    progressIdIdx: index('extraction_chunks_progress_id_idx').on(table.progressId),
    statusIdx: index('extraction_chunks_status_idx').on(table.status),
    chunkNumberIdx: index('extraction_chunks_chunk_number_idx').on(table.chunkNumber),
  })
);

export type ExtractionChunk = typeof extractionChunks.$inferSelect;
export type NewExtractionChunk = typeof extractionChunks.$inferInsert;
```

### 1.3 Schema Extension for Existing Tables

The schema already has `metadata_store` table (used by sync-state.ts). We'll extend it to work alongside the new extraction-focused tables:

- `metadata_store`: Quick key-value lookups (existing sync state)
- `extraction_progress`: Structured progress tracking with analytics
- `extraction_chunks`: Granular chunk-level history

---

## 2. UI Component Structure

### 2.1 File Structure

```
src/app/dashboard/extraction/
├── page.tsx                    # Main extraction control panel page
├── components/
│   ├── SourceCard.tsx          # Card for each source (Gmail, Calendar, Drive)
│   ├── ProgressBar.tsx         # Visual progress bar component
│   ├── DateRangePicker.tsx     # Select date range for re-extraction
│   ├── ChunkSizeSelector.tsx   # Choose chunk size (1 week, 1 month)
│   ├── ControlButtons.tsx      # Start/Pause/Reset buttons
│   └── StatsPanel.tsx          # Statistics display (items, cost, entities)
└── hooks/
    ├── useExtractionProgress.ts # SWR hook for fetching progress
    └── useExtractionControl.ts  # Hook for control actions (start/pause/reset)
```

### 2.2 Main Page Component

```typescript
// src/app/dashboard/extraction/page.tsx

'use client';

import { useExtractionProgress } from './hooks/useExtractionProgress';
import SourceCard from './components/SourceCard';

export default function ExtractionControlPanel() {
  const { data: progress, isLoading, error, mutate } = useExtractionProgress();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error} />;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Data Extraction Control</h1>
        <button
          onClick={() => mutate()}
          className="btn btn-secondary"
        >
          Refresh
        </button>
      </div>

      {/* Source Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SourceCard
          source="gmail"
          progress={progress?.gmail}
          onAction={mutate}
        />
        <SourceCard
          source="calendar"
          progress={progress?.calendar}
          onAction={mutate}
        />
        <SourceCard
          source="drive"
          progress={progress?.drive}
          onAction={mutate}
        />
      </div>

      {/* Global Stats */}
      <StatsPanel progress={progress} />
    </div>
  );
}
```

### 2.3 SourceCard Component

```typescript
// src/app/dashboard/extraction/components/SourceCard.tsx

'use client';

import { useState } from 'react';
import ProgressBar from './ProgressBar';
import ControlButtons from './ControlButtons';
import DateRangePicker from './DateRangePicker';
import ChunkSizeSelector from './ChunkSizeSelector';
import type { ExtractionProgress } from '@/lib/db/schema';

interface SourceCardProps {
  source: 'gmail' | 'calendar' | 'drive';
  progress?: ExtractionProgress;
  onAction: () => void;
}

export default function SourceCard({ source, progress, onAction }: SourceCardProps) {
  const [showConfig, setShowConfig] = useState(false);

  const sourceConfig = {
    gmail: {
      title: 'Email',
      icon: '📧',
      description: 'Gmail messages and threads',
    },
    calendar: {
      title: 'Calendar',
      icon: '📅',
      description: 'Calendar events and meetings',
    },
    drive: {
      title: 'Documents',
      icon: '📁',
      description: 'Google Drive files',
    },
  };

  const config = sourceConfig[source];
  const percentComplete = progress
    ? (progress.processedItems / Math.max(progress.totalItems, 1)) * 100
    : 0;

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="card-title">
            <span className="text-3xl">{config.icon}</span>
            {config.title}
          </h2>
          <div className={`badge ${getStatusBadgeColor(progress?.status)}`}>
            {progress?.status || 'idle'}
          </div>
        </div>

        <p className="text-sm text-base-content/70">{config.description}</p>

        {/* Progress Bar */}
        {progress && (
          <>
            <ProgressBar
              percent={percentComplete}
              current={progress.processedItems}
              total={progress.totalItems}
            />

            {/* Date Range */}
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-base-content/60">Oldest:</span>
                <span className="font-mono">
                  {progress.oldestDateExtracted
                    ? new Date(progress.oldestDateExtracted).toLocaleDateString()
                    : 'Not started'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/60">Newest:</span>
                <span className="font-mono">
                  {progress.newestDateExtracted
                    ? new Date(progress.newestDateExtracted).toLocaleDateString()
                    : 'Not started'}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="stats shadow mt-2">
              <div className="stat py-2 px-4">
                <div className="stat-title text-xs">Items</div>
                <div className="stat-value text-lg">
                  {progress.processedItems.toLocaleString()}
                </div>
              </div>
              <div className="stat py-2 px-4">
                <div className="stat-title text-xs">Entities</div>
                <div className="stat-value text-lg">
                  {progress.metadata?.entitiesExtracted?.toLocaleString() || 0}
                </div>
              </div>
              <div className="stat py-2 px-4">
                <div className="stat-title text-xs">Cost</div>
                <div className="stat-value text-lg">
                  ${(progress.totalCost / 100).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Last Run */}
            {progress.lastRunAt && (
              <div className="text-xs text-base-content/60">
                Last run: {new Date(progress.lastRunAt).toLocaleString()}
              </div>
            )}

            {/* Error Display */}
            {progress.lastError && (
              <div className="alert alert-error text-xs">
                <span>Error: {progress.lastError}</span>
              </div>
            )}
          </>
        )}

        {/* Control Buttons */}
        <div className="card-actions justify-end mt-4">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="btn btn-sm btn-ghost"
          >
            ⚙️ Configure
          </button>
          <ControlButtons
            source={source}
            status={progress?.status || 'idle'}
            onAction={onAction}
          />
        </div>

        {/* Configuration Panel (Collapsible) */}
        {showConfig && (
          <div className="mt-4 p-4 bg-base-200 rounded-lg space-y-4">
            <ChunkSizeSelector
              source={source}
              currentSize={progress?.chunkSize}
              onChange={onAction}
            />
            <DateRangePicker
              source={source}
              oldestDate={progress?.oldestDateExtracted}
              newestDate={progress?.newestDateExtracted}
              onSubmit={onAction}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function getStatusBadgeColor(status?: string) {
  switch (status) {
    case 'running':
      return 'badge-info';
    case 'completed':
      return 'badge-success';
    case 'error':
      return 'badge-error';
    case 'paused':
      return 'badge-warning';
    default:
      return 'badge-ghost';
  }
}
```

### 2.4 ProgressBar Component

```typescript
// src/app/dashboard/extraction/components/ProgressBar.tsx

interface ProgressBarProps {
  percent: number;
  current: number;
  total: number;
}

export default function ProgressBar({ percent, current, total }: ProgressBarProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>Progress</span>
        <span className="font-mono">
          {current.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
      <div className="w-full bg-base-300 rounded-full h-4 overflow-hidden">
        <div
          className="bg-primary h-full transition-all duration-500 flex items-center justify-end px-2"
          style={{ width: `${Math.min(percent, 100)}%` }}
        >
          {percent > 10 && (
            <span className="text-xs font-bold text-primary-content">
              {Math.round(percent)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 2.5 ControlButtons Component

```typescript
// src/app/dashboard/extraction/components/ControlButtons.tsx

'use client';

import { useState } from 'react';
import { useExtractionControl } from '../hooks/useExtractionControl';

interface ControlButtonsProps {
  source: 'gmail' | 'calendar' | 'drive';
  status: string;
  onAction: () => void;
}

export default function ControlButtons({ source, status, onAction }: ControlButtonsProps) {
  const { start, pause, reset } = useExtractionControl(source);
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = async () => {
    setIsLoading(true);
    await start();
    onAction();
    setIsLoading(false);
  };

  const handlePause = async () => {
    setIsLoading(true);
    await pause();
    onAction();
    setIsLoading(false);
  };

  const handleReset = async () => {
    if (!confirm(`Reset all extraction progress for ${source}? This will start over from scratch.`)) {
      return;
    }
    setIsLoading(true);
    await reset();
    onAction();
    setIsLoading(false);
  };

  return (
    <div className="flex gap-2">
      {status === 'running' ? (
        <button
          onClick={handlePause}
          disabled={isLoading}
          className="btn btn-sm btn-warning"
        >
          ⏸️ Pause
        </button>
      ) : (
        <button
          onClick={handleStart}
          disabled={isLoading || status === 'completed'}
          className="btn btn-sm btn-primary"
        >
          ▶️ {status === 'paused' ? 'Resume' : 'Start'}
        </button>
      )}
      <button
        onClick={handleReset}
        disabled={isLoading}
        className="btn btn-sm btn-ghost"
      >
        🔄 Reset
      </button>
    </div>
  );
}
```

---

## 3. API Endpoints

### 3.1 GET `/api/extraction/status`

Get current extraction progress for all sources.

**Request:**
```typescript
GET /api/extraction/status?userId=<userId>
```

**Response:**
```typescript
{
  gmail: {
    id: "uuid",
    source: "gmail",
    status: "running",
    oldestDateExtracted: "2025-01-01T00:00:00Z",
    newestDateExtracted: "2025-01-07T12:00:00Z",
    totalItems: 1000,
    processedItems: 450,
    failedItems: 5,
    currentChunkStart: "2025-01-03T00:00:00Z",
    currentChunkEnd: "2025-01-07T00:00:00Z",
    chunkSize: "1_week",
    lastRunAt: "2025-01-07T12:30:00Z",
    totalCost: 125, // cents
    totalTokens: 50000,
    metadata: {
      entitiesExtracted: 1234,
      averageEntitiesPerItem: 2.7
    }
  },
  calendar: { /* ... */ },
  drive: { /* ... */ }
}
```

### 3.2 POST `/api/extraction/start`

Start or resume extraction for a source.

**Request:**
```typescript
POST /api/extraction/start
Content-Type: application/json

{
  source: "gmail",
  userId: "user-123",
  chunkSize?: "1_week" | "1_month" | "3_months",
  startDate?: "2025-01-01T00:00:00Z", // Optional: extract from specific date
  endDate?: "2025-01-07T23:59:59Z"    // Optional: extract up to specific date
}
```

**Response:**
```typescript
{
  success: true,
  message: "Extraction started for gmail",
  progressId: "uuid",
  estimatedChunks: 4,
  estimatedDuration: "~2 hours"
}
```

### 3.3 POST `/api/extraction/pause`

Pause ongoing extraction.

**Request:**
```typescript
POST /api/extraction/pause
Content-Type: application/json

{
  source: "gmail",
  userId: "user-123"
}
```

**Response:**
```typescript
{
  success: true,
  message: "Extraction paused for gmail",
  currentChunk: 2,
  totalChunks: 4,
  canResume: true
}
```

### 3.4 POST `/api/extraction/reset`

Reset extraction progress and start over.

**Request:**
```typescript
POST /api/extraction/reset
Content-Type: application/json

{
  source: "gmail",
  userId: "user-123",
  clearChunks?: boolean // Default: true
}
```

**Response:**
```typescript
{
  success: true,
  message: "Extraction progress reset for gmail",
  itemsCleared: 450,
  chunksCleared: 2
}
```

### 3.5 POST `/api/extraction/config`

Update extraction configuration.

**Request:**
```typescript
POST /api/extraction/config
Content-Type: application/json

{
  source: "gmail",
  userId: "user-123",
  chunkSize: "1_month",
  dateRange?: {
    start: "2024-01-01T00:00:00Z",
    end: "2025-01-07T23:59:59Z"
  }
}
```

**Response:**
```typescript
{
  success: true,
  message: "Configuration updated",
  config: {
    chunkSize: "1_month",
    estimatedChunks: 13
  }
}
```

---

## 4. Implementation Plan

### Phase 1: Database Setup (Week 1)

**Tasks:**
1. Add `extraction_progress` and `extraction_chunks` tables to schema
2. Create migration script
3. Implement helper functions in `src/lib/extraction/progress.ts`:
   - `getExtractionProgress(userId, source)`
   - `updateExtractionProgress(progressId, updates)`
   - `createExtractionChunk(progressId, chunkStart, chunkEnd)`
   - `updateChunkStatus(chunkId, status, stats)`

**Files to Create:**
```
src/lib/extraction/
├── progress.ts          # Progress tracking helpers
├── chunk-calculator.ts  # Date range chunking logic
└── types.ts            # TypeScript types
```

### Phase 2: Chunk Processing Logic (Week 1-2)

**Chunking Strategy:**

```typescript
// src/lib/extraction/chunk-calculator.ts

export type ChunkSize = '1_week' | '1_month' | '3_months';

export interface DateChunk {
  start: Date;
  end: Date;
  number: number;
}

export function calculateChunks(
  startDate: Date,
  endDate: Date,
  chunkSize: ChunkSize
): DateChunk[] {
  const chunks: DateChunk[] = [];
  let current = new Date(startDate);
  let chunkNumber = 1;

  while (current < endDate) {
    const chunkEnd = new Date(current);

    switch (chunkSize) {
      case '1_week':
        chunkEnd.setDate(chunkEnd.getDate() + 7);
        break;
      case '1_month':
        chunkEnd.setMonth(chunkEnd.getMonth() + 1);
        break;
      case '3_months':
        chunkEnd.setMonth(chunkEnd.getMonth() + 3);
        break;
    }

    // Don't exceed end date
    if (chunkEnd > endDate) {
      chunkEnd.setTime(endDate.getTime());
    }

    chunks.push({
      start: new Date(current),
      end: chunkEnd,
      number: chunkNumber++,
    });

    current = new Date(chunkEnd);
  }

  return chunks;
}

export function getNextChunk(
  progress: ExtractionProgress
): DateChunk | null {
  const { oldestDateExtracted, currentChunkEnd, chunkSize } = progress;

  if (!oldestDateExtracted) {
    // First run: start from 30 days ago
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return {
      start: thirtyDaysAgo,
      end: now,
      number: 1,
    };
  }

  // Calculate next chunk going backwards in time
  const chunkStart = new Date(oldestDateExtracted);

  switch (chunkSize) {
    case '1_week':
      chunkStart.setDate(chunkStart.getDate() - 7);
      break;
    case '1_month':
      chunkStart.setMonth(chunkStart.getMonth() - 1);
      break;
    case '3_months':
      chunkStart.setMonth(chunkStart.getMonth() - 3);
      break;
  }

  return {
    start: chunkStart,
    end: new Date(oldestDateExtracted),
    number: (progress.metadata?.totalChunks || 0) + 1,
  };
}
```

**Modified Inngest Function:**

```typescript
// src/lib/events/functions/ingest-emails-chunked.ts

import { inngest } from '../index';
import { getGmailService } from '@/lib/google/gmail';
import { getServiceAccountAuth } from '@/lib/google/auth';
import {
  getExtractionProgress,
  updateExtractionProgress,
  createExtractionChunk,
  updateChunkStatus,
} from '@/lib/extraction/progress';
import { getNextChunk } from '@/lib/extraction/chunk-calculator';

export const ingestEmailsChunked = inngest.createFunction(
  {
    id: 'ingest-emails-chunked',
    name: 'Ingest Emails (Chunked)',
    retries: 3,
  },
  { event: 'izzie/extraction.start' },
  async ({ event, step }) => {
    const { userId, source } = event.data;

    if (source !== 'gmail') return; // Skip non-email sources

    console.log(`[IngestEmailsChunked] Starting for user ${userId}`);

    // Step 1: Get or initialize progress
    const progress = await step.run('get-progress', async () => {
      return await getExtractionProgress(userId, source);
    });

    // Step 2: Calculate next chunk
    const chunk = await step.run('calculate-chunk', async () => {
      const nextChunk = getNextChunk(progress);

      // Create chunk record
      const chunkRecord = await createExtractionChunk(
        progress.id,
        nextChunk.start,
        nextChunk.end,
        nextChunk.number
      );

      return { chunk: nextChunk, record: chunkRecord };
    });

    // Step 3: Update progress to "running"
    await step.run('update-progress-running', async () => {
      await updateExtractionProgress(progress.id, {
        status: 'running',
        currentChunkStart: chunk.chunk.start,
        currentChunkEnd: chunk.chunk.end,
        lastRunAt: new Date(),
      });
    });

    // Step 4: Fetch emails in chunk
    const emails = await step.run('fetch-chunk-emails', async () => {
      try {
        const auth = await getServiceAccountAuth(userId);
        const gmailService = await getGmailService(auth);

        console.log(
          `[IngestEmailsChunked] Fetching emails from ${chunk.chunk.start.toISOString()} to ${chunk.chunk.end.toISOString()}`
        );

        const batch = await gmailService.fetchEmails({
          folder: 'all',
          since: chunk.chunk.start,
          until: chunk.chunk.end,
          maxResults: 500, // Larger batch for chunk processing
        });

        console.log(`[IngestEmailsChunked] Fetched ${batch.emails.length} emails`);

        return batch.emails;
      } catch (error) {
        console.error(`[IngestEmailsChunked] Error fetching emails:`, error);

        // Mark chunk as failed
        await updateChunkStatus(chunk.record.id, 'failed', {
          error: (error as Error).message,
        });

        throw error;
      }
    });

    // Step 5: Emit extraction events
    const entitiesExtracted = await step.run('emit-extraction-events', async () => {
      let entityCount = 0;

      for (const email of emails) {
        // Emit extraction event
        await inngest.send({
          name: 'izzie/ingestion.email.extracted',
          data: {
            userId,
            emailId: email.id,
            subject: email.subject,
            body: email.body,
            from: email.from,
            to: email.to,
            date: email.date.toISOString(),
            threadId: email.threadId,
            labels: email.labels,
            snippet: email.snippet,
          },
        });

        // Estimate entities (will be updated by extraction results)
        entityCount += 3; // Rough estimate
      }

      return entityCount;
    });

    // Step 6: Update chunk status
    await step.run('update-chunk-completed', async () => {
      await updateChunkStatus(chunk.record.id, 'completed', {
        itemsFound: emails.length,
        itemsProcessed: emails.length,
      });
    });

    // Step 7: Update progress
    await step.run('update-progress', async () => {
      await updateExtractionProgress(progress.id, {
        oldestDateExtracted: chunk.chunk.start,
        newestDateExtracted: progress.newestDateExtracted || chunk.chunk.end,
        totalItems: progress.totalItems + emails.length,
        processedItems: progress.processedItems + emails.length,
        lastSuccessAt: new Date(),
        metadata: {
          ...progress.metadata,
          entitiesExtracted:
            (progress.metadata?.entitiesExtracted || 0) + entitiesExtracted,
          totalChunks: chunk.chunk.number,
        },
      });
    });

    // Step 8: Check if more chunks needed
    const shouldContinue = await step.run('check-continuation', async () => {
      // Continue if we haven't gone back far enough
      const maxHistoryDays = 365; // 1 year default
      const daysSoFar = Math.floor(
        (new Date().getTime() - chunk.chunk.start.getTime()) / (1000 * 60 * 60 * 24)
      );

      return daysSoFar < maxHistoryDays && progress.status !== 'paused';
    });

    // Step 9: Trigger next chunk or mark completed
    if (shouldContinue) {
      await step.run('trigger-next-chunk', async () => {
        await inngest.send({
          name: 'izzie/extraction.start',
          data: { userId, source: 'gmail' },
        });
      });
    } else {
      await step.run('mark-completed', async () => {
        await updateExtractionProgress(progress.id, {
          status: 'completed',
          completedAt: new Date(),
        });
      });
    }

    return {
      userId,
      source,
      chunkNumber: chunk.chunk.number,
      emailsProcessed: emails.length,
      entitiesExtracted,
      completedAt: new Date().toISOString(),
    };
  }
);
```

### Phase 3: API Endpoints (Week 2)

**Files to Create:**
```
src/app/api/extraction/
├── status/route.ts
├── start/route.ts
├── pause/route.ts
├── reset/route.ts
└── config/route.ts
```

**Example Implementation:**

```typescript
// src/app/api/extraction/start/route.ts

import { NextResponse } from 'next/server';
import { inngest } from '@/lib/events';
import { getExtractionProgress, updateExtractionProgress } from '@/lib/extraction/progress';
import type { ChunkSize } from '@/lib/extraction/chunk-calculator';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, source, chunkSize, startDate, endDate } = body;

    if (!userId || !source) {
      return NextResponse.json(
        { error: 'userId and source required' },
        { status: 400 }
      );
    }

    // Get or create progress record
    let progress = await getExtractionProgress(userId, source);

    // Update chunk size if provided
    if (chunkSize) {
      await updateExtractionProgress(progress.id, {
        chunkSize: chunkSize as ChunkSize,
      });
    }

    // Update date range if provided
    if (startDate || endDate) {
      await updateExtractionProgress(progress.id, {
        currentChunkStart: startDate ? new Date(startDate) : undefined,
        currentChunkEnd: endDate ? new Date(endDate) : undefined,
      });
    }

    // Trigger extraction via Inngest
    await inngest.send({
      name: 'izzie/extraction.start',
      data: { userId, source },
    });

    return NextResponse.json({
      success: true,
      message: `Extraction started for ${source}`,
      progressId: progress.id,
    });
  } catch (error) {
    console.error('[API] Error starting extraction:', error);
    return NextResponse.json(
      {
        error: 'Failed to start extraction',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
```

### Phase 4: UI Components (Week 3)

1. Build components in order:
   - ProgressBar → SourceCard → ControlButtons
   - DateRangePicker → ChunkSizeSelector
   - StatsPanel → Main Page

2. Add SWR hooks for real-time updates:
   - Poll `/api/extraction/status` every 5 seconds when extraction is running
   - Use optimistic updates for control actions

3. Add toast notifications for user feedback

### Phase 5: Testing & Polish (Week 3-4)

1. **Unit Tests:**
   - Chunk calculation logic
   - Progress tracking helpers
   - API endpoint handlers

2. **Integration Tests:**
   - Full extraction flow (start → chunk → complete)
   - Pause/resume functionality
   - Reset and re-extraction

3. **UI Polish:**
   - Loading states
   - Error handling
   - Responsive design
   - Accessibility (ARIA labels, keyboard nav)

---

## 5. Key Design Decisions

### 5.1 Why Separate `extraction_progress` from `metadata_store`?

- **Structured queries**: Complex aggregations and analytics
- **Type safety**: Strongly typed columns vs. JSONB
- **Performance**: Dedicated indexes for filtering and sorting
- **Backwards compatibility**: Keep existing sync-state.ts working

### 5.2 Why Chunk-Based Processing?

- **Resumability**: Pause/resume without losing progress
- **Rate limiting**: Avoid hitting API quotas
- **Cost control**: Stop extraction at any point
- **Granular errors**: Retry only failed chunks

### 5.3 Why Date-Based Watermarks vs. Page Tokens?

- **User control**: "Extract last 30 days" is intuitive
- **Re-extraction**: Easy to redo specific date ranges
- **Multi-source**: Works for Gmail, Calendar, Drive consistently
- **Fallback**: Store page tokens in metadata for efficiency

### 5.4 Status Transitions

```
idle → running → completed
  ↓       ↓
  ↓    paused → running
  ↓       ↓
  ↓    error → running (retry)
  ↓
reset → idle
```

---

## 6. Future Enhancements

1. **Smart Chunking:**
   - Auto-adjust chunk size based on data density
   - Smaller chunks for recent data (more activity)
   - Larger chunks for older data (less activity)

2. **Incremental Updates:**
   - Use Gmail `historyId` for efficient incremental syncs
   - Only extract new/modified items

3. **Cost Estimation:**
   - Predict extraction cost before starting
   - Set budget limits per source

4. **Selective Re-extraction:**
   - Re-extract only emails with failed entity extraction
   - Re-extract specific email threads or labels

5. **Analytics Dashboard:**
   - Entity type distribution over time
   - Network graph of co-occurring entities
   - Cost breakdown by source and time period

---

## Summary

This design provides:

✅ **Watermark tracking** - Date-based progress tracking
✅ **Reset/redo capability** - Full reset or specific date ranges
✅ **Date-based chunks** - Configurable chunk sizes (1 week, 1 month, 3 months)
✅ **Progress visualization** - Real-time progress bars and stats
✅ **Multi-source support** - Email, Calendar, Drive with unified interface

**Next Steps:**
1. Review and approve schema design
2. Create database migration
3. Implement chunk calculation logic
4. Build API endpoints
5. Develop UI components
6. Test and deploy
