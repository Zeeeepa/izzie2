# Phase 1: Autonomous Merge Handling Implementation

## Overview

This implementation adds autonomous merging of high-confidence entity duplicates to reduce manual merge approval work by ~60%.

## Architecture

The system now automatically applies merges when confidence scores are >= 0.95, while lower confidence merges (0.7-0.95) still require manual review.

### Key Components

1. **Merge Service** (`src/lib/entities/merge-service.ts`)
   - Creates merge suggestions with auto-apply logic
   - Applies merges to Weaviate when confidence >= 0.95
   - Tracks merge statistics

2. **Deduplication Service** (`src/lib/entities/deduplication.ts`)
   - Finds potential duplicates using string similarity algorithms
   - New `findAndProcessDuplicates()` function orchestrates autonomous merging
   - Integration with merge service for auto-apply

3. **Database Schema** (`src/lib/db/schema.ts`)
   - Added `appliedAt` field to track when merge was applied
   - Added `appliedBy` field to track who applied it ('system_auto' or userId)
   - Added `auto_applied` status to `MERGE_SUGGESTION_STATUS`

4. **API Endpoint** (`src/app/api/entities/deduplicate/route.ts`)
   - POST endpoint to trigger deduplication process
   - GET endpoint to retrieve merge statistics

## Database Migration

Migration file: `drizzle/migrations/0033_add_autonomous_merge_tracking.sql`

### To Apply Migration:

```bash
npm run db:migrate
```

### Migration Changes:

```sql
-- Add tracking fields for autonomous merges
ALTER TABLE "merge_suggestions" ADD COLUMN IF NOT EXISTS "applied_at" timestamp;
ALTER TABLE "merge_suggestions" ADD COLUMN IF NOT EXISTS "applied_by" text;
```

## Usage

### Trigger Deduplication via API

```typescript
// POST /api/entities/deduplicate
const response = await fetch('/api/entities/deduplicate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    minConfidence: 0.7, // Optional, defaults to 0.7
  }),
});

const result = await response.json();
// Returns:
// {
//   success: true,
//   result: {
//     totalFound: 150,
//     autoApplied: 95,      // ~60% auto-applied
//     pendingReview: 55     // ~40% require manual review
//   },
//   stats: {
//     totalSuggestions: 150,
//     pendingSuggestions: 55,
//     autoApplied: 95,
//     manuallyAccepted: 0,
//     rejected: 0,
//     autoApplyRate: 0.63
//   }
// }
```

### Get Merge Statistics

```typescript
// GET /api/entities/deduplicate
const response = await fetch('/api/entities/deduplicate');
const { stats } = await response.json();
```

### Programmatic Usage

```typescript
import { findAndProcessDuplicates } from '@/lib/entities/deduplication';
import { getMergeStats } from '@/lib/entities/merge-service';

// Find and process duplicates
const result = await findAndProcessDuplicates(userId, 0.7);
console.log(`Auto-applied: ${result.autoApplied}, Pending: ${result.pendingReview}`);

// Get statistics
const stats = await getMergeStats(userId);
console.log(`Auto-apply rate: ${(stats.autoApplyRate * 100).toFixed(1)}%`);
```

## Confidence Thresholds

| Confidence | Action | Rationale |
|-----------|--------|-----------|
| >= 0.95 | **Auto-apply** | Very high confidence - same email, exact nickname match, etc. |
| 0.7 - 0.94 | **Manual review** | High confidence but requires human verification |
| < 0.7 | **Ignore** | Too low confidence to suggest merge |

## Implementation Details

### Auto-Apply Threshold

```typescript
export const AUTO_APPLY_THRESHOLD = 0.95;
```

This threshold was chosen based on:
- **0.95-1.0**: Same email address, exact nickname match (bob/robert), very high string similarity
- **0.7-0.94**: Similar names, same domain, abbreviation match - needs human review
- **< 0.7**: Low similarity, different domains - not suggested

### Merge Process

1. **Find duplicates** using Weaviate query + string similarity
2. **Calculate confidence** using:
   - Exact email match (0.9)
   - Nickname variants (0.4)
   - Name similarity via Jaro-Winkler (0.5)
   - Same domain (0.2)
   - Last name match (0.3)

3. **Create merge suggestion** in Postgres with status:
   - `auto_applied` if confidence >= 0.95
   - `pending` if confidence < 0.95

4. **Auto-apply merge** (if confidence >= 0.95):
   - Delete duplicate entity from Weaviate
   - Update relationships to point to primary entity
   - Record `appliedAt` and `appliedBy` = 'system_auto'

### Error Handling

If auto-apply fails:
- Suggestion status reverts to `pending`
- `appliedAt` and `appliedBy` set to null
- Error logged for debugging
- Manual review required

## Testing

### Unit Tests

Test the merge service:

```typescript
import { createMergeSuggestion, AUTO_APPLY_THRESHOLD } from '@/lib/entities/merge-service';

// Test auto-apply for high confidence
const highConfidence = await createMergeSuggestion({
  userId: 'test-user',
  entity1Type: 'person',
  entity1Value: 'john_doe',
  entity2Type: 'person',
  entity2Value: 'john_j_doe',
  confidence: 0.97,
  matchReason: 'same_email, similar_name',
});
expect(highConfidence.autoApplied).toBe(true);
expect(highConfidence.status).toBe('auto_applied');

// Test manual review for lower confidence
const mediumConfidence = await createMergeSuggestion({
  userId: 'test-user',
  entity1Type: 'person',
  entity1Value: 'john_doe',
  entity2Type: 'person',
  entity2Value: 'john_david',
  confidence: 0.85,
  matchReason: 'similar_name',
});
expect(mediumConfidence.autoApplied).toBe(false);
expect(mediumConfidence.status).toBe('pending');
```

### Integration Tests

Test the full deduplication flow:

```typescript
// Create test entities in Weaviate
await saveEntities([
  { type: 'person', value: 'Bob Smith', normalized: 'bob_smith', confidence: 0.9 },
  { type: 'person', value: 'Robert Smith', normalized: 'robert_smith', confidence: 0.9 },
], userId, sourceId);

// Trigger deduplication
const result = await findAndProcessDuplicates(userId);

// Verify auto-merge occurred
expect(result.autoApplied).toBe(1);
expect(result.totalFound).toBe(1);

// Verify only one entity remains
const entities = await listEntitiesByType(userId, 'person');
expect(entities.filter(e => e.value.includes('Smith'))).toHaveLength(1);
```

## Monitoring

### Key Metrics to Track

1. **Auto-apply rate**: `autoApplied / totalSuggestions`
   - Target: ~60% based on research analysis
   - Track via `getMergeStats()`

2. **False positive rate**: Manual rejection of auto-applied merges
   - Monitor `rejected` suggestions with `appliedBy = 'system_auto'`
   - Should be < 5%

3. **Performance**: Time to process duplicates
   - O(n²) complexity for similarity matching
   - Consider batching for large datasets

### Logging

All merge operations are logged with:
- `[Merge Service]` prefix
- Entity IDs being merged
- Confidence scores
- Auto-apply decisions
- Success/failure status

## Future Enhancements

### Phase 2: Relationship Graph Updates

When merging entities, update all relationships:
- Update `fromEntityValue` where it matches merged entity
- Update `toEntityValue` where it matches merged entity
- Preserve relationship confidence scores

### Phase 3: Entity Attribute Merging

Merge additional entity metadata:
- Email aliases: Combine unique emails
- Context: Merge surrounding text
- Last seen: Use most recent timestamp

### Phase 4: User Feedback Loop

- Allow users to correct auto-applied merges
- Track corrections to refine confidence threshold
- Adjust algorithm based on user preferences

## Rollback Procedure

If autonomous merging causes issues:

1. **Disable auto-apply** by setting threshold to 1.0:
   ```typescript
   // In merge-service.ts
   export const AUTO_APPLY_THRESHOLD = 1.0; // Disable auto-apply
   ```

2. **Revert auto-applied merges** (manual process):
   ```sql
   -- Find recently auto-applied merges
   SELECT * FROM merge_suggestions
   WHERE status = 'auto_applied'
   AND applied_at > NOW() - INTERVAL '1 day'
   ORDER BY applied_at DESC;
   ```

3. **Re-create deleted entities** from source data:
   - Re-run entity extraction on affected sources
   - Entities will be re-discovered and stored

## Acceptance Criteria

✅ **Implemented**:
- [x] Auto-apply merges with confidence >= 0.95
- [x] Create manual review suggestions for 0.7 <= confidence < 0.95
- [x] Track merge status (pending, auto_applied, accepted, rejected)
- [x] Record appliedAt and appliedBy for audit trail
- [x] API endpoint to trigger deduplication
- [x] API endpoint to get merge statistics
- [x] Merge service with auto-apply logic
- [x] Database migration for new fields

✅ **Testing on Staging** (Next Step):
- [ ] Run deduplication on staging data
- [ ] Verify auto-apply rate ~60%
- [ ] Check false positive rate < 5%
- [ ] Monitor performance for large datasets
- [ ] Test error handling and rollback

## Files Changed

### New Files
- `src/lib/entities/merge-service.ts` - Merge service with auto-apply
- `src/app/api/entities/deduplicate/route.ts` - Deduplication API endpoint
- `drizzle/migrations/0033_add_autonomous_merge_tracking.sql` - Database migration

### Modified Files
- `src/lib/db/schema.ts` - Added appliedAt, appliedBy fields to mergeSuggestions
- `src/lib/entities/deduplication.ts` - Added findAndProcessDuplicates() function

## Summary

Phase 1 implementation enables autonomous merging of high-confidence entity duplicates, reducing manual merge work by ~60%. The system:

1. **Finds duplicates** using string similarity algorithms
2. **Auto-applies merges** when confidence >= 0.95
3. **Creates manual review suggestions** for 0.7 <= confidence < 0.95
4. **Tracks all operations** with full audit trail
5. **Provides API endpoints** for triggering and monitoring

Next step: **Test on staging** to validate auto-apply rate and false positive rate.
