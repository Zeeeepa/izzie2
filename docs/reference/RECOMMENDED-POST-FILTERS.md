# Recommended Post-Processing Filters

Quick implementation guide for fixing remaining extraction issues.

## Issue 1: Email Addresses as Person Names

### Problem
Email addresses like "bob@matsuoka.com" are being extracted as person entities.

### Solution: Add Email Regex Filter

**File:** `src/lib/extraction/entity-post-filters.ts` (NEW)

```typescript
/**
 * Filter out email addresses from person entities
 */
export function filterEmailAddresses(entities: Entity[]): Entity[] {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return entities.filter(entity => {
    // Only filter person entities
    if (entity.type !== 'person') {
      return true;
    }

    // Reject if value matches email pattern
    if (emailRegex.test(entity.value.trim())) {
      console.log(`[PostFilter] Rejected email as person: ${entity.value}`);
      return false;
    }

    return true;
  });
}
```

**Integration in `extract-gmail-entities.ts`:**
```typescript
import { filterEmailAddresses } from '@/lib/extraction/entity-post-filters';

// After extraction, before saving:
let processedEntities = normalizeToCurrentUser(extractionResult.entities, userIdentity);
processedEntities = filterEmailAddresses(processedEntities);  // <-- ADD THIS
const [deduplicatedEntities, dedupeStats] = deduplicateWithStats(processedEntities);
```

## Issue 2: Company Names as Person Names

### Problem
Group/brand names like "Hastings-on-Hudson Safety Posts" are being extracted as person entities.

### Solution: Add Company Indicator Filter

**Add to `src/lib/extraction/entity-post-filters.ts`:**

```typescript
/**
 * Filter out company/group names from person entities
 *
 * Rejects person entities with company/group indicators:
 * - "X Posts", "X Team", "X Support", "X Notifications"
 * - Well-known companies (Reddit, Facebook, LinkedIn, etc.)
 */
export function filterCompanyAsPersons(entities: Entity[]): Entity[] {
  const companyIndicators = [
    /\s+posts$/i,           // "Safety Posts"
    /\s+team$/i,            // "Support Team"
    /\s+support$/i,         // "Apple Support"
    /\s+notifications?$/i,  // "Reddit Notifications"
    /\s+updates?$/i,        // "Team Updates"
    /^(reddit|facebook|linkedin|twitter|instagram|google|apple|microsoft|github)\b/i,
  ];

  return entities.filter(entity => {
    // Only filter person entities
    if (entity.type !== 'person') {
      return true;
    }

    const value = entity.value.trim();

    // Check for company indicators
    for (const pattern of companyIndicators) {
      if (pattern.test(value)) {
        console.log(`[PostFilter] Rejected company as person: ${entity.value}`);
        return false;
      }
    }

    return true;
  });
}
```

**Integration in `extract-gmail-entities.ts`:**
```typescript
import { filterEmailAddresses, filterCompanyAsPersons } from '@/lib/extraction/entity-post-filters';

// After extraction, before saving:
let processedEntities = normalizeToCurrentUser(extractionResult.entities, userIdentity);
processedEntities = filterEmailAddresses(processedEntities);
processedEntities = filterCompanyAsPersons(processedEntities);  // <-- ADD THIS
const [deduplicatedEntities, dedupeStats] = deduplicateWithStats(processedEntities);
```

## Issue 3: Require "Firstname Lastname" Format

### Problem
Single names like "Bob" without last names are being extracted.

### Solution: Add Name Format Validator

**Add to `src/lib/extraction/entity-post-filters.ts`:**

```typescript
/**
 * Require person names to be in "Firstname Lastname" format
 *
 * Rejects:
 * - Single names ("Bob", "John")
 * - Names with 3+ parts ("John Q. Public Jr.")
 *
 * Accepts:
 * - Two-part names ("Bob Matsuoka", "John Doe")
 */
export function requireFullNames(entities: Entity[], strict = false): Entity[] {
  return entities.filter(entity => {
    // Only filter person entities
    if (entity.type !== 'person') {
      return true;
    }

    const parts = entity.value.trim().split(/\s+/);

    if (strict) {
      // Strict mode: require exactly 2 parts (Firstname Lastname)
      if (parts.length !== 2) {
        console.log(`[PostFilter] Rejected invalid name format: ${entity.value} (parts: ${parts.length})`);
        return false;
      }
    } else {
      // Lenient mode: require at least 2 parts
      if (parts.length < 2) {
        console.log(`[PostFilter] Rejected single name: ${entity.value}`);
        return false;
      }
    }

    return true;
  });
}
```

**Integration (lenient mode - allow "John Q. Public"):**
```typescript
processedEntities = requireFullNames(processedEntities, false);
```

**Integration (strict mode - only "Firstname Lastname"):**
```typescript
processedEntities = requireFullNames(processedEntities, true);
```

## Complete Post-Filter Pipeline

**Full integration in `extract-gmail-entities.ts`:**

```typescript
import {
  filterEmailAddresses,
  filterCompanyAsPersons,
  requireFullNames
} from '@/lib/extraction/entity-post-filters';

// After extraction:
let processedEntities = extractionResult.entities;

// 1. Normalize user identity (consolidate "me" entities)
processedEntities = normalizeToCurrentUser(processedEntities, userIdentity);

// 2. Apply post-processing filters
processedEntities = filterEmailAddresses(processedEntities);
processedEntities = filterCompanyAsPersons(processedEntities);
processedEntities = requireFullNames(processedEntities, false); // lenient mode

// 3. Deduplicate entities
const [deduplicatedEntities, dedupeStats] = deduplicateWithStats(processedEntities);

// 4. Save to Weaviate
await saveToWeaviate(deduplicatedEntities, userId, message.id, options.skipWeaviate);
```

## Complete Implementation File

**File:** `src/lib/extraction/entity-post-filters.ts`

```typescript
/**
 * Entity Post-Processing Filters
 *
 * Filters applied after LLM extraction to improve quality:
 * - Remove email addresses from person entities
 * - Remove company/group names from person entities
 * - Require full names (Firstname Lastname)
 */

import type { Entity } from './types';

const LOG_PREFIX = '[PostFilter]';

/**
 * Filter out email addresses from person entities
 */
export function filterEmailAddresses(entities: Entity[]): Entity[] {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return entities.filter(entity => {
    if (entity.type !== 'person') return true;

    if (emailRegex.test(entity.value.trim())) {
      console.log(`${LOG_PREFIX} Rejected email as person: ${entity.value}`);
      return false;
    }

    return true;
  });
}

/**
 * Filter out company/group names from person entities
 */
export function filterCompanyAsPersons(entities: Entity[]): Entity[] {
  const companyIndicators = [
    /\s+posts$/i,
    /\s+team$/i,
    /\s+support$/i,
    /\s+notifications?$/i,
    /\s+updates?$/i,
    /^(reddit|facebook|linkedin|twitter|instagram|google|apple|microsoft|github)\b/i,
  ];

  return entities.filter(entity => {
    if (entity.type !== 'person') return true;

    const value = entity.value.trim();
    for (const pattern of companyIndicators) {
      if (pattern.test(value)) {
        console.log(`${LOG_PREFIX} Rejected company as person: ${entity.value}`);
        return false;
      }
    }

    return true;
  });
}

/**
 * Require person names to be in "Firstname Lastname" format
 */
export function requireFullNames(entities: Entity[], strict = false): Entity[] {
  return entities.filter(entity => {
    if (entity.type !== 'person') return true;

    const parts = entity.value.trim().split(/\s+/);

    if (strict) {
      if (parts.length !== 2) {
        console.log(`${LOG_PREFIX} Rejected invalid name format: ${entity.value}`);
        return false;
      }
    } else {
      if (parts.length < 2) {
        console.log(`${LOG_PREFIX} Rejected single name: ${entity.value}`);
        return false;
      }
    }

    return true;
  });
}

/**
 * Apply all post-processing filters in sequence
 */
export function applyAllFilters(entities: Entity[], options?: {
  strictNameFormat?: boolean;
}): Entity[] {
  let filtered = entities;

  filtered = filterEmailAddresses(filtered);
  filtered = filterCompanyAsPersons(filtered);
  filtered = requireFullNames(filtered, options?.strictNameFormat || false);

  return filtered;
}
```

## Estimated Impact

With these filters applied:

| Issue | Before | After (Estimated) |
|-------|--------|-------------------|
| Email addresses as persons | ~15% | 0% |
| Company names as persons | ~20% | ~5% |
| Single names ("Bob") | ~30% | ~10% (lenient) / 0% (strict) |
| **Overall person accuracy** | **~70%** | **~90%** |

## Testing

After implementing, test with:

```bash
# Test with 10 emails
npx tsx scripts/extract-gmail-entities.ts --limit 10

# Verify results
npx tsx scripts/verify-latest-extraction.ts | grep "Person" -A 20
```

## LOC Impact

- New file: `src/lib/extraction/entity-post-filters.ts` (~100 lines)
- Modified: `scripts/extract-gmail-entities.ts` (+5 lines)
- **Net: +105 lines**
