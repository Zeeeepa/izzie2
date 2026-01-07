# Extraction Progress Schema - Implementation Summary

## Overview
Created database schema for tracking extraction progress across email, calendar, and drive data sources.

## Files Modified

### 1. Schema Definition
**File:** `/src/lib/db/schema.ts`

Added `extractionProgress` table with the following structure:

```typescript
export const extractionProgress = pgTable('extraction_progress', {
  // Identity
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  source: text('source').notNull(), // 'email' | 'calendar' | 'drive'
  status: text('status').notNull().default('idle'), // 'idle' | 'running' | 'paused' | 'completed' | 'error'

  // Watermarks - track extraction boundaries
  oldestDateExtracted: timestamp('oldest_date_extracted'),
  newestDateExtracted: timestamp('newest_date_extracted'),

  // Progress counters
  totalItems: integer('total_items').default(0),
  processedItems: integer('processed_items').default(0),
  failedItems: integer('failed_items').default(0),

  // Chunk configuration
  chunkSizeDays: integer('chunk_size_days').default(7),
  currentChunkStart: timestamp('current_chunk_start'),
  currentChunkEnd: timestamp('current_chunk_end'),

  // Stats
  entitiesExtracted: integer('entities_extracted').default(0),
  totalCost: integer('total_cost').default(0), // Cost in cents

  // Timestamps
  lastRunAt: timestamp('last_run_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Type exports added:**
```typescript
export type ExtractionProgress = typeof extractionProgress.$inferSelect;
export type NewExtractionProgress = typeof extractionProgress.$inferInsert;
```

### 2. Migration Files

**Migration SQL:** `/drizzle/migrations/0008_add_extraction_progress.sql`
- Creates `extraction_progress` table
- Adds foreign key to `users` table
- Creates 4 indexes:
  - `extraction_progress_user_id_idx` - Query by user
  - `extraction_progress_source_idx` - Query by source
  - `extraction_progress_status_idx` - Query by status
  - `extraction_progress_user_source_unique` - Unique constraint (userId, source)

**Migration Journal:** `/drizzle/migrations/meta/_journal.json`
- Updated to include migration 0008

### 3. Helper Scripts

**Migration Runner:** `/scripts/run-migration-0008.ts`
- Standalone script to apply migration 0008
- Usage: `npx tsx scripts/run-migration-0008.ts`

**Verification Script:** `/scripts/verify-extraction-progress.ts`
- Verifies table structure, indexes, and constraints
- Usage: `npx tsx scripts/verify-extraction-progress.ts`

## Database Structure

### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | text | NO | UUID | Primary key |
| user_id | text | NO | - | Foreign key to users |
| source | text | NO | - | Data source (email/calendar/drive) |
| status | text | NO | 'idle' | Current extraction status |
| oldest_date_extracted | timestamp | YES | - | Oldest data point extracted |
| newest_date_extracted | timestamp | YES | - | Newest data point extracted |
| total_items | integer | YES | 0 | Total items to process |
| processed_items | integer | YES | 0 | Items successfully processed |
| failed_items | integer | YES | 0 | Items that failed processing |
| chunk_size_days | integer | YES | 7 | Days per extraction chunk |
| current_chunk_start | timestamp | YES | - | Current chunk start date |
| current_chunk_end | timestamp | YES | - | Current chunk end date |
| entities_extracted | integer | YES | 0 | Total entities extracted |
| total_cost | integer | YES | 0 | Total cost in cents |
| last_run_at | timestamp | YES | - | Last extraction run timestamp |
| created_at | timestamp | NO | now() | Record creation time |
| updated_at | timestamp | NO | now() | Record update time |

### Indexes

1. **Primary Key:** `extraction_progress_pkey` on `id`
2. **User Index:** `extraction_progress_user_id_idx` on `user_id`
3. **Source Index:** `extraction_progress_source_idx` on `source`
4. **Status Index:** `extraction_progress_status_idx` on `status`
5. **Unique Constraint:** `extraction_progress_user_source_unique` on `(user_id, source)`

### Constraints

1. **Primary Key:** `extraction_progress_pkey` on `id`
2. **Foreign Key:** `extraction_progress_user_id_users_id_fk`
   - References: `users(id)` ON DELETE CASCADE

## Status Values

The `status` column supports the following states:
- `idle` - No extraction in progress (default)
- `running` - Currently extracting data
- `paused` - Extraction paused by user
- `completed` - Extraction finished
- `error` - Error occurred during extraction

## Source Values

The `source` column supports:
- `email` - Gmail/email extraction
- `calendar` - Google Calendar extraction
- `drive` - Google Drive extraction

## Cost Tracking

The `total_cost` field stores cost in **cents** (integer):
- $0.50 = 50 cents
- $1.25 = 125 cents
- This avoids floating-point precision issues

## Usage Examples

### Creating a new progress record
```typescript
import { db } from '@/lib/db';
import { extractionProgress, type NewExtractionProgress } from '@/lib/db/schema';

const newProgress: NewExtractionProgress = {
  userId: 'user-123',
  source: 'email',
  status: 'idle',
  chunkSizeDays: 7,
};

await db.insert(extractionProgress).values(newProgress);
```

### Querying progress by user and source
```typescript
import { db } from '@/lib/db';
import { extractionProgress } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const progress = await db
  .select()
  .from(extractionProgress)
  .where(
    and(
      eq(extractionProgress.userId, userId),
      eq(extractionProgress.source, 'email')
    )
  )
  .limit(1);
```

### Updating progress
```typescript
import { db } from '@/lib/db';
import { extractionProgress } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

await db
  .update(extractionProgress)
  .set({
    status: 'running',
    processedItems: 150,
    lastRunAt: new Date(),
    updatedAt: new Date(),
  })
  .where(eq(extractionProgress.id, progressId));
```

## Migration Status

✅ **Migration Applied:** 2026-01-07
- Migration file: `0008_add_extraction_progress.sql`
- Journal updated with migration entry
- Table created successfully in database
- All indexes and constraints verified

## Next Steps

Refer to `docs/extraction-control-panel-design.md` for:
- Progress tracking implementation
- Background job integration
- UI components for the extraction control panel
- API endpoints for progress management

## Verification

Run the verification script to check the table structure:
```bash
npx tsx scripts/verify-extraction-progress.ts
```

Expected output:
- ✅ Table exists
- ✅ 17 columns with correct types
- ✅ 5 indexes (including unique constraint)
- ✅ 2 constraints (PK + FK to users)
