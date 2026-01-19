/**
 * Entity Post-Processing Filters
 *
 * Filters applied after LLM extraction to improve quality and reach 90% accuracy:
 * - Filter 1: Remove email addresses from person entities (~15% of errors)
 * - Filter 2: Detect company indicators in person names (~20% of errors)
 * - Filter 3: Require full names for persons (~30% of errors)
 *
 * Target: 90% accuracy for person entity extraction
 */

import type { Entity, EntityType } from './types';

const LOG_PREFIX = '[PostFilter]';

/**
 * Result of a filter operation on a single entity
 */
export interface FilterResult {
  keep: boolean;
  reclassifyAs?: EntityType;
  reason?: string;
}

/**
 * Statistics from applying filters
 */
export interface FilterStats {
  totalEntities: number;
  filtered: number;
  reclassified: number;
  kept: number;
  filterBreakdown: {
    emailAddresses: number;
    companyIndicators: number;
    singleNames: number;
  };
}

/**
 * Options for configuring post-filters
 */
export interface FilterOptions {
  strictNameFormat?: boolean; // Require exactly 2 name parts (default: false - lenient mode)
  knownSingleNames?: string[]; // Exception list for single-name contacts (e.g., ["Madonna", "Cher"])
  logFiltered?: boolean; // Log filtered entities (default: true)
}

/**
 * Filter 1: Remove email addresses from person entities
 *
 * Problem: Email addresses like "bob@matsuoka.com" are being extracted as person entities
 * Solution: Detect email pattern and remove from person entities
 */
export function filterEmailAddresses(entity: Entity): FilterResult {
  // Only filter person entities
  if (entity.type !== 'person') {
    return { keep: true };
  }

  // Email regex pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Check if value matches email pattern
  if (emailRegex.test(entity.value.trim())) {
    return {
      keep: false,
      reason: `Email address detected: ${entity.value}`,
    };
  }

  return { keep: true };
}

/**
 * Filter 2: Detect company indicators in person names
 *
 * Problem: Company/brand names like "Hastings-on-Hudson Safety Posts", "Reddit Notifications"
 *          are being extracted as person entities
 * Solution: Detect patterns like "X Posts", "X Notifications", "X Support", "X Team" and reclassify
 */
export function filterCompanyIndicators(entity: Entity): FilterResult {
  // Only filter person entities
  if (entity.type !== 'person') {
    return { keep: true };
  }

  const value = entity.value.trim();

  // Company indicator patterns
  const companyIndicators = [
    /\s+posts$/i, // "Safety Posts"
    /\s+team$/i, // "Support Team"
    /\s+support$/i, // "Apple Support"
    /\s+notifications?$/i, // "Reddit Notifications"
    /\s+updates?$/i, // "Team Updates"
    /\s+bot$/i, // "Slack Bot"
    /\s+news$/i, // "Tech News"
    /\s+daily$/i, // "News Daily"
    /\s+weekly$/i, // "Weekly Updates"
    /^(reddit|facebook|linkedin|twitter|x|instagram|google|apple|microsoft|github)\b/i, // Known companies
  ];

  // Check for company indicators
  for (const pattern of companyIndicators) {
    if (pattern.test(value)) {
      return {
        keep: true, // Keep the entity but reclassify
        reclassifyAs: 'company',
        reason: `Company indicator detected: ${entity.value}`,
      };
    }
  }

  return { keep: true };
}

/**
 * Filter 3: Require full names for persons
 *
 * Problem: Single names like "Bob" without last names are being extracted
 * Solution: Require at least 2 name parts for person entities (with exceptions)
 */
export function filterSingleNames(
  entity: Entity,
  knownSingleNames?: string[]
): FilterResult {
  // Only filter person entities
  if (entity.type !== 'person') {
    return { keep: true };
  }

  const value = entity.value.trim();

  // Check if in exception list (e.g., known single-name contacts)
  if (knownSingleNames && knownSingleNames.includes(value)) {
    return { keep: true };
  }

  // Split into parts (handle multiple spaces)
  const parts = value.split(/\s+/).filter((p) => p.length > 0);

  // Require at least 2 parts (Firstname Lastname)
  if (parts.length < 2) {
    return {
      keep: false,
      reason: `Single name without last name: ${entity.value}`,
    };
  }

  return { keep: true };
}

/**
 * Apply all post-processing filters to a list of entities
 *
 * Returns filtered entities and statistics
 */
export function applyPostFilters(
  entities: Entity[],
  options?: FilterOptions
): {
  filtered: Entity[];
  removed: Entity[];
  reclassified: Entity[];
  stats: FilterStats;
} {
  const { strictNameFormat = false, knownSingleNames = [], logFiltered = true } = options || {};

  const filtered: Entity[] = [];
  const removed: Entity[] = [];
  const reclassified: Entity[] = [];

  const stats: FilterStats = {
    totalEntities: entities.length,
    filtered: 0,
    reclassified: 0,
    kept: 0,
    filterBreakdown: {
      emailAddresses: 0,
      companyIndicators: 0,
      singleNames: 0,
    },
  };

  for (const entity of entities) {
    // Apply filters in sequence
    let currentEntity = entity;
    let shouldKeep = true;
    let filterReason: string | undefined;

    // Filter 1: Email addresses
    const emailResult = filterEmailAddresses(currentEntity);
    if (!emailResult.keep) {
      shouldKeep = false;
      filterReason = emailResult.reason;
      stats.filterBreakdown.emailAddresses++;
    }

    // Filter 2: Company indicators (only if not already filtered)
    if (shouldKeep) {
      const companyResult = filterCompanyIndicators(currentEntity);
      if (companyResult.reclassifyAs) {
        // Reclassify entity
        currentEntity = {
          ...currentEntity,
          type: companyResult.reclassifyAs,
        };
        reclassified.push(currentEntity);
        stats.reclassified++;
        stats.filterBreakdown.companyIndicators++;

        if (logFiltered) {
          console.log(`${LOG_PREFIX} 🔄 Reclassified: "${entity.value}" (person → company)`);
        }
      }
    }

    // Filter 3: Single names (only if not already filtered)
    if (shouldKeep) {
      const nameResult = filterSingleNames(currentEntity, knownSingleNames);
      if (!nameResult.keep) {
        shouldKeep = false;
        filterReason = nameResult.reason;
        stats.filterBreakdown.singleNames++;
      }
    }

    // Add to appropriate list
    if (shouldKeep) {
      filtered.push(currentEntity);
      stats.kept++;
    } else {
      removed.push(currentEntity);
      stats.filtered++;

      if (logFiltered && filterReason) {
        console.log(`${LOG_PREFIX} ❌ Removed: ${filterReason}`);
      }
    }
  }

  return { filtered, removed, reclassified, stats };
}

/**
 * Log filter statistics to console
 */
export function logFilterStats(stats: FilterStats): void {
  console.log(`\n${LOG_PREFIX} Filter Statistics:`);
  console.log(`  Total entities: ${stats.totalEntities}`);
  console.log(`  Kept: ${stats.kept}`);
  console.log(`  Filtered: ${stats.filtered}`);
  console.log(`  Reclassified: ${stats.reclassified}`);
  console.log(`\n${LOG_PREFIX} Filter Breakdown:`);
  console.log(`  Email addresses: ${stats.filterBreakdown.emailAddresses}`);
  console.log(`  Company indicators: ${stats.filterBreakdown.companyIndicators}`);
  console.log(`  Single names: ${stats.filterBreakdown.singleNames}`);

  if (stats.totalEntities > 0) {
    const successRate = ((stats.kept + stats.reclassified) / stats.totalEntities) * 100;
    console.log(`\n${LOG_PREFIX} Success rate: ${successRate.toFixed(1)}%`);
  }
}
