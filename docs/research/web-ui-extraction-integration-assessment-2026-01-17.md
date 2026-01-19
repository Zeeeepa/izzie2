# Web UI Extraction Integration Assessment

**Date**: 2026-01-17
**Status**: Gap Identified - CLI improvements not integrated into Web UI
**Priority**: High

## Executive Summary

The web UI has extraction controls and progress tracking, but the extraction pipeline **does not use the improvements** implemented in the CLI script (`scripts/extract-gmail-entities.ts`). The web UI is missing critical extraction enhancements:

- ✅ User identity normalization
- ✅ Entity deduplication
- ✅ Post-extraction filtering
- ✅ Weaviate storage (already integrated)

## Current Web UI Extraction Capabilities

### 1. Dashboard Controls
**Location**: `/src/app/dashboard/page.tsx`

**Features**:
- ✅ Start/Pause/Reset extraction buttons
- ✅ Source selection (Email, Calendar, Drive)
- ✅ Date range selection (7d, 30d, 90d, all)
- ✅ Real-time progress tracking with:
  - Progress percentage
  - Items processed/total
  - Entities extracted count
  - Processing rate (items/sec)
  - Estimated time remaining (ETA)
  - Failed items count
- ✅ Auto-polling every 2 seconds during active extraction
- ✅ Visual status badges (idle, running, paused, completed, error)

### 2. Entities Dashboard
**Location**: `/src/app/dashboard/entities/page.tsx`

**Features**:
- ✅ Browse extracted entities by type
- ✅ Search and filter entities
- ✅ Statistics summary cards (clickable filters)
- ✅ Entity type breakdown (people, companies, action_items, etc.)

### 3. API Endpoints

#### Extraction Control API
**Base Path**: `/src/app/api/extraction/`

**Endpoints**:
- ✅ `POST /api/extraction/start` - Start extraction for a source
- ✅ `GET /api/extraction/status` - Get progress for all sources
- ✅ `POST /api/extraction/pause` - Pause extraction
- ✅ `POST /api/extraction/reset` - Reset extraction state

**Features**:
- ✅ Authentication required via `requireAuth()`
- ✅ Progress tracking via `@/lib/extraction/progress`
- ✅ Date range calculation
- ✅ Background sync triggering
- ✅ Processing rate and ETA calculation

#### Gmail Sync API
**Location**: `/src/app/api/gmail/sync-user/route.ts`

**Current Implementation**:
```typescript
// ✅ HAS
- User OAuth authentication
- Gmail API integration
- Entity extraction via getEntityExtractor()
- Weaviate storage via saveEntities()
- Progress tracking (counters, status updates)
- Real-time UI updates (every email)
- Pause/resume support
- Error handling and retry logic

// ❌ MISSING
- getUserIdentity() - User identity normalization
- deduplicateWithStats() - Entity deduplication
- applyPostFilters() - Post-extraction filtering
- normalizeToCurrentUser() - Email address normalization
```

## Gap Analysis

### What's Missing in Web UI

The web UI extraction pipeline (`/api/gmail/sync-user`) **does NOT use**:

1. **User Identity Module** (`@/lib/extraction/user-identity`)
   - Purpose: Normalize sender emails to "Me" for sent emails
   - Impact: Entities show raw email addresses instead of "Me"
   - Used in CLI: ✅ Yes

2. **Deduplication Module** (`@/lib/extraction/deduplication`)
   - Purpose: Remove duplicate entities across emails
   - Impact: Same entity appears multiple times
   - Used in CLI: ✅ Yes

3. **Post-Filters Module** (`@/lib/extraction/post-filters`)
   - Purpose: Filter out low-quality entities
   - Impact: Noise in extracted entities (generic topics, low confidence)
   - Used in CLI: ✅ Yes

### CLI vs Web UI Comparison

| Feature | CLI Script | Web UI API |
|---------|-----------|-----------|
| OAuth Authentication | ✅ | ✅ |
| Gmail Sync | ✅ | ✅ |
| Entity Extraction | ✅ | ✅ |
| Weaviate Storage | ✅ | ✅ |
| Progress Tracking | ✅ | ✅ |
| **User Identity Normalization** | ✅ | ❌ |
| **Entity Deduplication** | ✅ | ❌ |
| **Post-Extraction Filters** | ✅ | ❌ |
| Pause/Resume | ❌ | ✅ |
| Real-time UI Updates | ❌ | ✅ |

## Technical Details

### CLI Extraction Pipeline (scripts/extract-gmail-entities.ts)

```typescript
import { getUserIdentity, normalizeToCurrentUser } from '@/lib/extraction/user-identity';
import { deduplicateWithStats } from '@/lib/extraction/deduplication';
import { applyPostFilters, logFilterStats } from '@/lib/extraction/post-filters';

// Step 1: Get user identity for normalization
const userIdentity = getUserIdentity(userEmail);

// Step 2: Extract entities
const extractionResult = await extractor.extractFromEmail(email);

// Step 3: Normalize user identity
const normalizedEntities = normalizeToCurrentUser(
  extractionResult.entities,
  userIdentity,
  email
);

// Step 4: Deduplicate entities
const { uniqueEntities, duplicatesRemoved } = deduplicateWithStats(normalizedEntities);

// Step 5: Apply post-extraction filters
const filteredEntities = applyPostFilters(uniqueEntities);

// Step 6: Save to Weaviate
await saveEntities(filteredEntities, userId, emailId);
```

### Web UI Extraction Pipeline (/api/gmail/sync-user)

```typescript
// Current implementation (simplified)

// Step 1: Extract entities
const extractionResult = await extractor.extractFromEmail(email);

// Step 2: Save to Weaviate directly (NO FILTERING)
if (extractionResult.entities.length > 0) {
  await saveEntities(extractionResult.entities, userId, message.id);
  entitiesCount += extractionResult.entities.length;
}
```

**Missing Steps**:
- ❌ User identity normalization
- ❌ Entity deduplication
- ❌ Post-extraction filtering

## Impact Assessment

### Without User Identity Normalization
**Example**:
- Sent email from "masa@example.com" to "john@acme.com"
- CLI: Person entity shows "Me" (normalized)
- Web UI: Person entity shows "masa@example.com" (raw)

**User Experience**: Less intuitive, harder to filter "my" contacts vs. others

### Without Deduplication
**Example**:
- 10 emails all mention "John Doe"
- CLI: 1 unique "John Doe" entity
- Web UI: 10 duplicate "John Doe" entities

**User Experience**: Cluttered entity dashboard, inflated counts

### Without Post-Filters
**Example**:
- Email contains low-confidence topic "general discussion"
- CLI: Filtered out (too generic)
- Web UI: Included in results

**User Experience**: Noise, less actionable entities

## Recommended Solution

### Option 1: Drop-In Integration (Recommended)
**Approach**: Add the three missing modules to `/api/gmail/sync-user/route.ts`

**Changes Required**:
1. Import the modules
2. Add 3 processing steps before `saveEntities()`
3. Update entity count tracking

**Estimated Effort**: 1-2 hours
**Risk**: Low (modules are tested in CLI)
**Benefit**: Feature parity with CLI

**Code Changes**:
```typescript
// Add imports at top
import { getUserIdentity, normalizeToCurrentUser } from '@/lib/extraction/user-identity';
import { deduplicateWithStats } from '@/lib/extraction/deduplication';
import { applyPostFilters, logFilterStats } from '@/lib/extraction/post-filters';

// In startUserSync() function, around line 290:

// Get user identity once (outside email loop)
const userIdentity = getUserIdentity(userEmail);

// Inside email processing loop, replace extraction block:
try {
  // Extract entities using AI
  const extractor = getEntityExtractor();
  const extractionResult = await extractor.extractFromEmail(email);

  // NEW: Step 1 - Normalize user identity
  const normalizedEntities = normalizeToCurrentUser(
    extractionResult.entities,
    userIdentity,
    email
  );

  // NEW: Step 2 - Deduplicate entities
  const { uniqueEntities, duplicatesRemoved } = deduplicateWithStats(normalizedEntities);

  // NEW: Step 3 - Apply post-filters
  const filteredEntities = applyPostFilters(uniqueEntities);

  console.log(
    `[Gmail Sync User] Processed email ${message.id}: ` +
    `${extractionResult.entities.length} raw -> ` +
    `${uniqueEntities.length} unique -> ` +
    `${filteredEntities.entities.length} filtered`
  );

  // Save to Weaviate if entities remain after filtering
  if (filteredEntities.entities.length > 0) {
    await saveEntities(filteredEntities.entities, userId, message.id);

    console.log(
      `[Gmail Sync User] Saved ${filteredEntities.entities.length} entities to Weaviate for email ${message.id}`
    );

    // Update counter with FINAL count (after filtering)
    entitiesCount += filteredEntities.entities.length;
  }
} catch (extractionError) {
  // ... error handling
}
```

### Option 2: Extract Shared Module (Future Enhancement)
**Approach**: Create `@/lib/extraction/pipeline.ts` shared by both CLI and API

**Benefits**:
- Single source of truth
- Easier to maintain
- Consistent behavior

**Estimated Effort**: 3-4 hours
**Risk**: Medium (requires refactoring)
**Benefit**: Long-term maintainability

## Testing Plan

After integration, verify:

1. **Functional Testing**
   - [ ] Start extraction from web UI
   - [ ] Verify entities appear in dashboard
   - [ ] Check entity counts match CLI results
   - [ ] Verify "Me" normalization for sent emails
   - [ ] Confirm deduplication works (no duplicate entities)
   - [ ] Verify filtering removes low-quality entities

2. **Performance Testing**
   - [ ] Extraction speed similar to before
   - [ ] Memory usage acceptable
   - [ ] Progress updates still real-time

3. **Regression Testing**
   - [ ] Pause/Resume still works
   - [ ] Error handling unchanged
   - [ ] Progress tracking accurate

## Next Steps

1. **Immediate**: Implement Option 1 (drop-in integration)
2. **Testing**: Run extraction on 10-20 emails, verify improvements
3. **Monitoring**: Watch for any issues in production
4. **Future**: Consider Option 2 for code consolidation

## Appendix: File Locations

### Web UI Files
- Dashboard: `/src/app/dashboard/page.tsx`
- Entities: `/src/app/dashboard/entities/page.tsx`
- Extraction API: `/src/app/api/extraction/start/route.ts`
- Gmail Sync: `/src/app/api/gmail/sync-user/route.ts`

### Library Modules
- User Identity: `/src/lib/extraction/user-identity.ts`
- Deduplication: `/src/lib/extraction/deduplication.ts`
- Post-Filters: `/src/lib/extraction/post-filters.ts`
- Entity Extractor: `/src/lib/extraction/entity-extractor.ts`
- Progress Tracking: `/src/lib/extraction/progress.ts`

### CLI Scripts
- Main Script: `/scripts/extract-gmail-entities.ts`
- Test Scripts: `/scripts/test-extraction-*.ts`

---

**Assessment By**: Research Agent
**Date**: 2026-01-17
**Status**: Ready for Implementation
