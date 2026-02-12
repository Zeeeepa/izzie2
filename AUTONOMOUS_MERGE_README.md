# Autonomous Entity Merge Implementation

## Quick Start

This implementation adds automatic merging of high-confidence entity duplicates to reduce manual work by ~60%.

### 1. Apply Database Migration

```bash
npm run db:migrate
```

This adds `appliedAt` and `appliedBy` fields to the `merge_suggestions` table for tracking autonomous merges.

### 2. Test the Implementation

```bash
# Run test script (optional)
tsx scripts/test-autonomous-merge.ts

# Or trigger via API
curl -X POST http://localhost:3000/api/entities/deduplicate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"minConfidence": 0.7}'
```

### 3. Monitor Results

```bash
# Get merge statistics
curl -X GET http://localhost:3000/api/entities/deduplicate \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## How It Works

### Confidence Thresholds

| Confidence | Action | Examples |
|-----------|--------|----------|
| **>= 0.95** | ✅ Auto-merge | Same email, exact nickname (Bob/Robert), very high similarity |
| **0.7 - 0.94** | 📋 Manual review | Similar names, same company domain, abbreviations |
| **< 0.7** | ❌ Ignore | Low similarity, different entities |

### Auto-Merge Process

1. **Find duplicates** using string similarity algorithms:
   - Levenshtein distance
   - Jaro-Winkler similarity
   - Nickname matching (Bob = Robert)
   - Company abbreviations (IBM = International Business Machines)

2. **Calculate confidence scores** based on:
   - Same email address: +0.9
   - Nickname match: +0.4
   - Name similarity: +0.5 (scaled by Jaro-Winkler score)
   - Same domain: +0.2
   - Last name match: +0.3

3. **Auto-apply if confidence >= 0.95**:
   - Delete duplicate entity from Weaviate
   - Create merge suggestion with `status = 'auto_applied'`
   - Record timestamp and `appliedBy = 'system_auto'`

4. **Create manual review suggestion if 0.7 <= confidence < 0.95**:
   - Create merge suggestion with `status = 'pending'`
   - Wait for user review

## API Endpoints

### POST /api/entities/deduplicate

Trigger deduplication process for the authenticated user.

**Request:**
```json
{
  "minConfidence": 0.7  // Optional, default: 0.7
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "totalFound": 150,
    "autoApplied": 95,
    "pendingReview": 55
  },
  "stats": {
    "totalSuggestions": 150,
    "pendingSuggestions": 55,
    "autoApplied": 95,
    "manuallyAccepted": 0,
    "rejected": 0,
    "autoApplyRate": 0.63
  }
}
```

### GET /api/entities/deduplicate

Get merge statistics for the authenticated user.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalSuggestions": 150,
    "pendingSuggestions": 55,
    "autoApplied": 95,
    "manuallyAccepted": 0,
    "rejected": 0,
    "autoApplyRate": 0.63
  }
}
```

## Programmatic Usage

```typescript
import { findAndProcessDuplicates } from '@/lib/entities/deduplication';
import { getMergeStats } from '@/lib/entities/merge-service';

// Find and process duplicates
const result = await findAndProcessDuplicates(userId, 0.7);
console.log(`Auto-applied: ${result.autoApplied}`);
console.log(`Pending review: ${result.pendingReview}`);

// Get statistics
const stats = await getMergeStats(userId);
console.log(`Auto-apply rate: ${(stats.autoApplyRate * 100).toFixed(1)}%`);
```

## Configuration

### Adjust Auto-Apply Threshold

Edit `src/lib/entities/merge-service.ts`:

```typescript
// Current threshold: 0.95 (95% confidence required for auto-merge)
export const AUTO_APPLY_THRESHOLD = 0.95;

// To be more conservative (fewer auto-merges):
export const AUTO_APPLY_THRESHOLD = 0.98;

// To be more aggressive (more auto-merges):
export const AUTO_APPLY_THRESHOLD = 0.90;
```

## Monitoring

### Key Metrics

1. **Auto-apply rate**: Target ~60% (range: 50-70%)
   - Track via `stats.autoApplyRate`
   - If too high: Raise threshold
   - If too low: Lower threshold or improve matching

2. **False positive rate**: Target < 5%
   - Monitor rejected auto-applied merges
   - Query: `SELECT * FROM merge_suggestions WHERE status = 'rejected' AND applied_by = 'system_auto'`

3. **Processing time**: Monitor for performance
   - O(n²) complexity for similarity matching
   - Consider batching for large datasets

### Logs

All operations are logged with `[Merge Service]` prefix:

```
[Merge Service] Creating merge suggestion: bob_smith → robert_smith (confidence: 0.973, auto-apply: true)
[Merge Service] Auto-applying merge: person-0-bob_smith → person-0-robert_smith
[Entity Deduplication] Deleted 1 merged entities
[Merge Service] Merge completed successfully
```

## Error Handling

### If Auto-Apply Fails

1. Suggestion status reverts to `pending`
2. `appliedAt` and `appliedBy` set to null
3. Error logged for debugging
4. Manual review required

### Rollback Procedure

If autonomous merging causes issues:

1. **Disable auto-apply**:
   ```typescript
   // Set threshold to 1.0 to disable
   export const AUTO_APPLY_THRESHOLD = 1.0;
   ```

2. **Find affected merges**:
   ```sql
   SELECT * FROM merge_suggestions
   WHERE status = 'auto_applied'
   AND applied_at > NOW() - INTERVAL '1 day';
   ```

3. **Re-extract entities** from source data to restore deleted entities

## Testing

### Unit Tests

Create tests in `src/lib/entities/__tests__/merge-service.test.ts`:

```typescript
import { createMergeSuggestion, AUTO_APPLY_THRESHOLD } from '../merge-service';

describe('Merge Service', () => {
  it('auto-applies high confidence merges', async () => {
    const result = await createMergeSuggestion({
      userId: 'test',
      entity1Type: 'person',
      entity1Value: 'john_doe',
      entity2Type: 'person',
      entity2Value: 'john_j_doe',
      confidence: 0.97,
      matchReason: 'same_email',
    });

    expect(result.autoApplied).toBe(true);
    expect(result.status).toBe('auto_applied');
  });

  it('creates manual review for lower confidence', async () => {
    const result = await createMergeSuggestion({
      userId: 'test',
      entity1Type: 'person',
      entity1Value: 'john_doe',
      entity2Type: 'person',
      entity2Value: 'john_smith',
      confidence: 0.85,
      matchReason: 'similar_name',
    });

    expect(result.autoApplied).toBe(false);
    expect(result.status).toBe('pending');
  });
});
```

### Integration Tests

Test the full deduplication flow with real Weaviate data.

## Files

### New Files
- `src/lib/entities/merge-service.ts` - Core merge logic
- `src/app/api/entities/deduplicate/route.ts` - API endpoints
- `drizzle/migrations/0033_add_autonomous_merge_tracking.sql` - Database migration
- `scripts/test-autonomous-merge.ts` - Test script
- `docs/PHASE1_AUTONOMOUS_MERGE_IMPLEMENTATION.md` - Detailed documentation

### Modified Files
- `src/lib/db/schema.ts` - Added fields to `mergeSuggestions` table
- `src/lib/entities/deduplication.ts` - Added `findAndProcessDuplicates()` function

## Next Steps

1. ✅ **Apply migration**: `npm run db:migrate`
2. 🧪 **Test on staging**: Run deduplication on staging data
3. 📊 **Monitor metrics**: Track auto-apply rate and false positives
4. 🔧 **Tune threshold**: Adjust `AUTO_APPLY_THRESHOLD` based on results
5. 🚀 **Deploy to production**: After validation

## Support

For questions or issues:
- See detailed docs: `docs/PHASE1_AUTONOMOUS_MERGE_IMPLEMENTATION.md`
- Check logs with `[Merge Service]` prefix
- Review merge suggestions in database: `SELECT * FROM merge_suggestions`
