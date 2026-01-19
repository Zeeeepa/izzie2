/**
 * Entity Deduplication System
 *
 * Post-processing to remove duplicate entities:
 * - Normalize entity names (lowercase, remove special chars, handle variations)
 * - Compare by type + normalized name
 * - Keep highest confidence version when duplicates found
 * - Handle common variations (bob/robert, Inc./Inc, etc.)
 */

import type { Entity } from './types';

const LOG_PREFIX = '[Deduplication]';

/**
 * Deduplication statistics
 */
export interface DeduplicationStats {
  originalCount: number;
  deduplicatedCount: number;
  duplicatesRemoved: number;
  byType: Record<string, { original: number; deduplicated: number }>;
}

/**
 * Deduplicate entities by type and normalized name
 *
 * Strategy:
 * 1. Group entities by type + normalized name
 * 2. For each group, keep the entity with highest confidence
 * 3. Merge contexts from duplicates
 *
 * @param entities - Entities to deduplicate
 * @returns Deduplicated entities
 */
export function deduplicateEntities(entities: Entity[]): Entity[] {
  if (entities.length === 0) {
    return [];
  }

  // Group entities by type + normalized name
  const groups = new Map<string, Entity[]>();

  for (const entity of entities) {
    const key = createDeduplicationKey(entity);
    const existing = groups.get(key);

    if (existing) {
      existing.push(entity);
    } else {
      groups.set(key, [entity]);
    }
  }

  // Keep highest confidence from each group
  const deduplicated: Entity[] = [];

  for (const [key, group] of groups) {
    if (group.length === 1) {
      deduplicated.push(group[0]);
    } else {
      // Merge duplicates: keep highest confidence, combine contexts
      const merged = mergeDuplicateEntities(group);
      deduplicated.push(merged);
    }
  }

  return deduplicated;
}

/**
 * Create deduplication key for an entity
 *
 * Strategy:
 * - Normalize name (lowercase, remove special chars)
 * - Handle common variations (Inc./Incorporated, Ltd./Limited, etc.)
 * - Use type + normalized name as key
 *
 * @param entity - Entity to create key for
 * @returns Deduplication key (e.g., "person:john_doe")
 */
function createDeduplicationKey(entity: Entity): string {
  const type = entity.type;
  let normalized = normalizeForDeduplication(entity.value);

  // Handle common variations for companies
  if (type === 'company') {
    normalized = normalizeCompanyName(normalized);
  }

  // Handle common variations for person names
  if (type === 'person') {
    normalized = normalizePersonName(normalized);
  }

  return `${type}:${normalized}`;
}

/**
 * Normalize string for deduplication
 * (lowercase, remove punctuation, remove extra whitespace)
 */
function normalizeForDeduplication(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .trim();
}

/**
 * Normalize company name for deduplication
 *
 * Handles:
 * - "Inc." vs "Incorporated"
 * - "Ltd." vs "Limited"
 * - "Corp." vs "Corporation"
 * - "LLC" variations
 *
 * @param normalized - Already normalized company name
 * @returns Further normalized company name
 */
function normalizeCompanyName(normalized: string): string {
  // Remove common suffixes
  const suffixMap: Record<string, string> = {
    incorporated: '',
    inc: '',
    limited: '',
    ltd: '',
    corporation: '',
    corp: '',
    llc: '',
    company: '',
    co: '',
  };

  let result = normalized;

  // Replace suffixes
  for (const [suffix, replacement] of Object.entries(suffixMap)) {
    // Match at end of string
    const regex = new RegExp(`_${suffix}$`, 'g');
    result = result.replace(regex, replacement);
  }

  return result.replace(/_+$/, ''); // Remove trailing underscores
}

/**
 * Normalize person name for deduplication
 *
 * Handles:
 * - "Bob" vs "Robert"
 * - "Mike" vs "Michael"
 * - First name only vs full name
 *
 * Note: This is intentionally simple - we rely on the LLM to normalize
 * names properly. This just handles obvious variations.
 *
 * @param normalized - Already normalized person name
 * @returns Further normalized person name
 */
function normalizePersonName(normalized: string): string {
  // Nickname variations (lowercase)
  const nicknameMap: Record<string, string> = {
    bob: 'robert',
    bobby: 'robert',
    rob: 'robert',
    mike: 'michael',
    mikey: 'michael',
    mick: 'michael',
    bill: 'william',
    billy: 'william',
    will: 'william',
    rick: 'richard',
    dick: 'richard',
    rich: 'richard',
    chris: 'christopher',
    matt: 'matthew',
    jon: 'jonathan',
    nick: 'nicholas',
    ben: 'benjamin',
    alex: 'alexander',
    al: 'alexander',
    liz: 'elizabeth',
    beth: 'elizabeth',
    kate: 'katherine',
    katy: 'katherine',
    katie: 'katherine',
    maggie: 'margaret',
    meg: 'margaret',
    jen: 'jennifer',
    jenny: 'jennifer',
    jess: 'jessica',
    jessie: 'jessica',
    becky: 'rebecca',
    becca: 'rebecca',
    steph: 'stephanie',
    sam: 'samantha',
    sammy: 'samantha',
    dan: 'daniel',
    danny: 'daniel',
  };

  // Check if first part is a known nickname
  const parts = normalized.split('_');
  if (parts.length > 0) {
    const firstName = parts[0];
    if (nicknameMap[firstName]) {
      parts[0] = nicknameMap[firstName];
      return parts.join('_');
    }
  }

  return normalized;
}

/**
 * Merge duplicate entities into one
 *
 * Strategy:
 * - Keep entity with highest confidence
 * - Combine unique contexts
 * - Use most common source
 *
 * @param duplicates - Array of duplicate entities
 * @returns Merged entity
 */
function mergeDuplicateEntities(duplicates: Entity[]): Entity {
  if (duplicates.length === 1) {
    return duplicates[0];
  }

  // Sort by confidence (highest first)
  const sorted = [...duplicates].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0];

  // Collect unique contexts
  const contexts = new Set<string>();
  for (const entity of duplicates) {
    if (entity.context) {
      contexts.add(entity.context);
    }
  }

  // Merge contexts into one string
  const mergedContext =
    contexts.size > 0 ? Array.from(contexts).join(' | ') : best.context;

  // Keep best entity with merged context
  return {
    ...best,
    context: mergedContext,
  };
}

/**
 * Deduplicate entities and return statistics
 *
 * @param entities - Entities to deduplicate
 * @returns Tuple of [deduplicated entities, stats]
 */
export function deduplicateWithStats(
  entities: Entity[]
): [Entity[], DeduplicationStats] {
  const originalCount = entities.length;

  // Count by type before deduplication
  const byTypeBefore = countByType(entities);

  // Deduplicate
  const deduplicated = deduplicateEntities(entities);
  const deduplicatedCount = deduplicated.length;

  // Count by type after deduplication
  const byTypeAfter = countByType(deduplicated);

  // Build stats
  const byType: Record<string, { original: number; deduplicated: number }> = {};
  for (const type of new Set([...Object.keys(byTypeBefore), ...Object.keys(byTypeAfter)])) {
    byType[type] = {
      original: byTypeBefore[type] || 0,
      deduplicated: byTypeAfter[type] || 0,
    };
  }

  const stats: DeduplicationStats = {
    originalCount,
    deduplicatedCount,
    duplicatesRemoved: originalCount - deduplicatedCount,
    byType,
  };

  if (stats.duplicatesRemoved > 0) {
    console.log(`${LOG_PREFIX} Removed ${stats.duplicatesRemoved} duplicates (${originalCount} → ${deduplicatedCount})`);
    console.log(`${LOG_PREFIX} By type:`, stats.byType);
  }

  return [deduplicated, stats];
}

/**
 * Count entities by type
 */
function countByType(entities: Entity[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const entity of entities) {
    counts[entity.type] = (counts[entity.type] || 0) + 1;
  }

  return counts;
}

/**
 * Find potential duplicates across multiple extraction results
 *
 * Useful for analysis - not used in the main pipeline.
 *
 * @param entities - All entities to analyze
 * @returns Groups of potential duplicates
 */
export function findPotentialDuplicates(entities: Entity[]): Map<string, Entity[]> {
  const groups = new Map<string, Entity[]>();

  for (const entity of entities) {
    const key = createDeduplicationKey(entity);
    const existing = groups.get(key);

    if (existing) {
      existing.push(entity);
    } else {
      groups.set(key, [entity]);
    }
  }

  // Filter to only groups with 2+ entities
  const duplicates = new Map<string, Entity[]>();

  for (const [key, group] of groups) {
    if (group.length > 1) {
      duplicates.set(key, group);
    }
  }

  return duplicates;
}
