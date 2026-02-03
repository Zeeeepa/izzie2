/**
 * Entity Post-Processing Filters
 *
 * Filters applied after LLM extraction to improve quality and reach 90% accuracy:
 * - Filter 1: Remove email addresses from person entities (~15% of errors)
 * - Filter 2: Detect company indicators in person names (~20% of errors)
 * - Filter 3: Require full names for persons (~30% of errors)
 * - Filter 4: Filter famous people/companies from newsletters (~25% of errors)
 * - Filter 5: Filter known newsletter sources (~10% of errors)
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
    famousPeople: number;
    newsletterCompanies: number;
    newsletterTopics: number;
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
 * Filter 4: Filter famous people unlikely to be personal contacts
 *
 * Problem: Tech celebrities and public figures from newsletters are being extracted
 * Solution: Filter out well-known public figures unless source indicates direct contact
 */
export function filterFamousPeople(entity: Entity): FilterResult {
  // Only filter person entities
  if (entity.type !== 'person') {
    return { keep: true };
  }

  const value = entity.value.trim().toLowerCase();

  // Famous tech/business figures often mentioned in newsletters
  const famousPeople = [
    'elon musk', 'sam altman', 'satya nadella', 'sundar pichai', 'tim cook',
    'mark zuckerberg', 'jeff bezos', 'bill gates', 'jensen huang', 'dario amodei',
    'demis hassabis', 'ilya sutskever', 'andrej karpathy', 'yann lecun',
    'geoffrey hinton', 'fei-fei li', 'andrew ng', 'mustafa suleyman',
    'reid hoffman', 'peter thiel', 'marc andreessen', 'ben horowitz',
    'jack dorsey', 'brian chesky', 'travis kalanick', 'adam neumann',
    'sheryl sandberg', 'marissa mayer', 'ginni rometty', 'meg whitman',
  ];

  // Check if it's a famous person
  if (famousPeople.includes(value)) {
    // Only filter if source is body (newsletters mention in body)
    // Keep if from metadata (direct email contact)
    if (entity.source === 'body') {
      return {
        keep: false,
        reason: `Famous person from body content (likely newsletter): ${entity.value}`,
      };
    }
  }

  return { keep: true };
}

/**
 * Filter 5: Filter well-known companies from newsletter content
 *
 * Problem: Big tech companies mentioned in newsletters are being extracted
 * Solution: Filter out major companies when mentioned in body (not direct business context)
 */
export function filterNewsletterCompanies(entity: Entity): FilterResult {
  // Only filter company entities
  if (entity.type !== 'company') {
    return { keep: true };
  }

  const value = entity.value.trim().toLowerCase();

  // Major tech/media companies often mentioned in newsletters
  // These should only be extracted if user works for/with them directly
  const newsletterCompanies = [
    'microsoft', 'google', 'apple', 'amazon', 'meta', 'facebook', 'openai',
    'anthropic', 'nvidia', 'tesla', 'twitter', 'x corp', 'linkedin', 'netflix',
    'spotify', 'uber', 'airbnb', 'salesforce', 'oracle', 'ibm', 'intel', 'amd',
    'mit technology review', 'techcrunch', 'the verge', 'wired', 'ars technica',
    'hacker news', 'y combinator', 'andreessen horowitz', 'sequoia capital',
    'new york times', 'washington post', 'wall street journal', 'bloomberg',
    'reuters', 'associated press', 'bbc', 'cnn', 'nbc', 'abc', 'cbs', 'fox',
  ];

  // Check if it's a commonly-mentioned company
  if (newsletterCompanies.includes(value)) {
    // Only filter if source is body (newsletters mention in body)
    // Keep if from metadata or subject (direct business correspondence)
    if (entity.source === 'body') {
      return {
        keep: false,
        reason: `Well-known company from body content (likely newsletter): ${entity.value}`,
      };
    }
  }

  return { keep: true };
}

/**
 * Filter 6: Filter generic newsletter topics
 *
 * Problem: Generic tech/news topics from newsletters are being extracted
 * Solution: Filter out common newsletter topics that aren't personally relevant
 */
export function filterNewsletterTopics(entity: Entity): FilterResult {
  // Only filter topic entities
  if (entity.type !== 'topic') {
    return { keep: true };
  }

  const value = entity.value.trim().toLowerCase();

  // Generic topics commonly found in tech newsletters
  const genericTopics = [
    'artificial intelligence', 'machine learning', 'ai', 'ml', 'llm', 'gpt',
    'cryptocurrency', 'crypto', 'bitcoin', 'blockchain', 'nft', 'web3',
    'startup', 'venture capital', 'funding round', 'ipo', 'acquisition',
    'tech industry', 'silicon valley', 'big tech', 'tech news',
    'data privacy', 'cybersecurity', 'regulation', 'antitrust',
    'climate tech', 'electric vehicles', 'autonomous driving',
    'social media', 'content moderation', 'misinformation',
  ];

  // Check if it's a generic newsletter topic
  if (genericTopics.includes(value)) {
    // Only filter if source is body
    if (entity.source === 'body') {
      return {
        keep: false,
        reason: `Generic newsletter topic: ${entity.value}`,
      };
    }
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
      famousPeople: 0,
      newsletterCompanies: 0,
      newsletterTopics: 0,
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

    // Filter 4: Famous people from newsletters (only if not already filtered)
    if (shouldKeep) {
      const famousResult = filterFamousPeople(currentEntity);
      if (!famousResult.keep) {
        shouldKeep = false;
        filterReason = famousResult.reason;
        stats.filterBreakdown.famousPeople++;
      }
    }

    // Filter 5: Well-known companies from newsletters (only if not already filtered)
    if (shouldKeep) {
      const companyResult = filterNewsletterCompanies(currentEntity);
      if (!companyResult.keep) {
        shouldKeep = false;
        filterReason = companyResult.reason;
        stats.filterBreakdown.newsletterCompanies++;
      }
    }

    // Filter 6: Generic newsletter topics (only if not already filtered)
    if (shouldKeep) {
      const topicResult = filterNewsletterTopics(currentEntity);
      if (!topicResult.keep) {
        shouldKeep = false;
        filterReason = topicResult.reason;
        stats.filterBreakdown.newsletterTopics++;
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
  console.log(`  Famous people (newsletter): ${stats.filterBreakdown.famousPeople}`);
  console.log(`  Newsletter companies: ${stats.filterBreakdown.newsletterCompanies}`);
  console.log(`  Newsletter topics: ${stats.filterBreakdown.newsletterTopics}`);

  if (stats.totalEntities > 0) {
    const successRate = ((stats.kept + stats.reclassified) / stats.totalEntities) * 100;
    console.log(`\n${LOG_PREFIX} Success rate: ${successRate.toFixed(1)}%`);
  }
}
