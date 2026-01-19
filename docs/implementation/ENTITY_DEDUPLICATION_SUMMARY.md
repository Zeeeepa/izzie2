# Entity Deduplication Implementation Summary

## Overview
Added deduplication logic to the entities API to prevent duplicate entities from appearing in the dashboard. Entities are now deduplicated by their `type + normalized` key, showing only the best version with an occurrence count.

## Changes Made

### 1. API Route (`/src/app/api/entities/route.ts`)
- **Added `occurrences` field** to `EntityData` interface
- **Implemented deduplication logic** after fetching all entities but before sorting/limiting
- **Deduplication strategy**:
  - Group by `type:normalized` key (case-insensitive)
  - When duplicates found, keep the entity with:
    1. **Highest confidence** (primary)
    2. **Longest value** (more details, e.g., "Robert (Masa) Matsuoka" over "Robert M.")
    3. **Most recent createdAt** (tiebreaker)
  - Track **occurrences count** for all duplicates found

### 2. Entity Card Component (`/src/components/dashboard/EntityCard.tsx`)
- **Added `occurrences` field** to `EntityCardProps` interface
- **Display occurrences badge** in card header (next to type badge)
- Shows badge with format `{count}x` when occurrences > 1
- Includes tooltip: "This entity appears in {count} emails"

### 3. Dashboard Page (`/src/app/dashboard/entities/page.tsx`)
- **Added `occurrences` field** to `Entity` interface
- No other changes needed - occurrences automatically passed to EntityCard

### 4. Test Script (`/scripts/test-entity-deduplication.ts`)
- Created unit test for deduplication logic
- Tests duplicate handling with various scenarios:
  - Same entity with different confidence levels
  - Same entity with different value lengths
  - Same entity with different timestamps
- All tests passing ✅

## Deduplication Algorithm

```typescript
// Group by type + normalized key (case-insensitive)
const entityMap = new Map<string, EntityData>();

for (const entity of entities) {
  const key = `${entity.type}:${entity.normalized.toLowerCase()}`;
  const existing = entityMap.get(key);

  if (!existing) {
    // First occurrence - add with count of 1
    entityMap.set(key, { ...entity, occurrences: 1 });
  } else {
    // Update occurrences count
    existing.occurrences = (existing.occurrences || 1) + 1;

    // Determine if we should replace the existing entity
    // Priority: higher confidence > longer value (more details) > more recent
    const shouldReplace =
      entity.confidence > existing.confidence ||
      (entity.confidence === existing.confidence &&
        entity.value.length > existing.value.length) ||
      (entity.confidence === existing.confidence &&
        entity.value.length === existing.value.length &&
        new Date(entity.createdAt).getTime() > new Date(existing.createdAt).getTime());

    if (shouldReplace) {
      // Keep the better entity but preserve occurrences count
      entityMap.set(key, { ...entity, occurrences: existing.occurrences });
    }
  }
}

const deduplicated = Array.from(entityMap.values());
```

## Test Results

### Before Deduplication
```
Input entities: 6
  - person:robert_matsuoka = "Robert (Masa) Matsuoka" (confidence: 0.95)
  - person:robert_matsuoka = "Robert Matsuoka" (confidence: 0.92)
  - person:robert_matsuoka = "Robert (Masa) Matsuoka" (confidence: 0.95)
  - person:robert_matsuoka = "Robert M." (confidence: 0.85)
  - company:acme_corp = "Acme Corp" (confidence: 0.98)
  - company:acme_corp = "Acme Corporation" (confidence: 0.98)
```

### After Deduplication
```
Unique entities: 2
  - person:robert_matsuoka = "Robert (Masa) Matsuoka" (occurrences: 4) ✅
  - company:acme_corp = "Acme Corporation" (occurrences: 2) ✅
```

### Verification
- ✅ Robert entity: Kept "Robert (Masa) Matsuoka" (longest value with highest confidence)
- ✅ Acme entity: Kept "Acme Corporation" (longer value, same confidence)
- ✅ Occurrences count correct: 4 for Robert, 2 for Acme

## Benefits

1. **Cleaner Dashboard**: No duplicate entities cluttering the UI
2. **Better UX**: Shows the most informative version of each entity
3. **Context Preserved**: Occurrences count shows how frequently an entity appeared
4. **Performance**: Deduplication happens server-side, reducing client-side rendering load

## Example Output

Before: 10+ instances of "Robert Matsuoka" with slight variations
After: 1 instance showing "Robert (Masa) Matsuoka" with badge "10x"

## LOC Delta
- Added: ~80 lines (deduplication logic, UI updates, tests)
- Removed: 0 lines
- Net Change: +80 lines

## Files Modified
1. `/src/app/api/entities/route.ts` - Deduplication logic
2. `/src/components/dashboard/EntityCard.tsx` - Occurrences badge display
3. `/src/app/dashboard/entities/page.tsx` - Interface update
4. `/scripts/test-entity-deduplication.ts` - Test coverage (new file)

## Testing
Run test: `npx tsx scripts/test-entity-deduplication.ts`
Expected output: All tests passing ✅
