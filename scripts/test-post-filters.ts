/**
 * Test Post-Processing Filters
 *
 * Verify all three filter types work correctly:
 * 1. Email addresses as person names
 * 2. Company indicators in person names
 * 3. Single names without last names
 */

import { applyPostFilters, logFilterStats } from '@/lib/extraction/post-filters';
import type { Entity } from '@/lib/extraction/types';

const LOG_PREFIX = '[TestFilters]';

// Test data
const testEntities: Entity[] = [
  // Valid person entities (should pass)
  {
    type: 'person',
    value: 'Robert Matsuoka',
    normalized: 'robert_matsuoka',
    confidence: 0.95,
    source: 'metadata',
  },
  {
    type: 'person',
    value: 'John Doe',
    normalized: 'john_doe',
    confidence: 0.9,
    source: 'body',
  },
  {
    type: 'person',
    value: 'Jane Q. Smith',
    normalized: 'jane_q_smith',
    confidence: 0.85,
    source: 'subject',
  },

  // Filter 1: Email addresses (should be removed)
  {
    type: 'person',
    value: 'bob@matsuoka.com',
    normalized: 'bob_matsuoka_com',
    confidence: 0.8,
    source: 'metadata',
  },
  {
    type: 'person',
    value: 'john.doe@example.com',
    normalized: 'john_doe_example_com',
    confidence: 0.75,
    source: 'body',
  },

  // Filter 2: Company indicators (should be reclassified to company)
  {
    type: 'person',
    value: 'Reddit Notifications',
    normalized: 'reddit_notifications',
    confidence: 0.7,
    source: 'metadata',
  },
  {
    type: 'person',
    value: 'GitHub Support',
    normalized: 'github_support',
    confidence: 0.8,
    source: 'metadata',
  },
  {
    type: 'person',
    value: 'Safety Posts',
    normalized: 'safety_posts',
    confidence: 0.75,
    source: 'body',
  },
  {
    type: 'person',
    value: 'Team Updates',
    normalized: 'team_updates',
    confidence: 0.7,
    source: 'subject',
  },

  // Filter 3: Single names (should be removed)
  {
    type: 'person',
    value: 'Bob',
    normalized: 'bob',
    confidence: 0.9,
    source: 'body',
  },
  {
    type: 'person',
    value: 'npm',
    normalized: 'npm',
    confidence: 0.85,
    source: 'metadata',
  },
  {
    type: 'person',
    value: 'bobmatnyc',
    normalized: 'bobmatnyc',
    confidence: 0.8,
    source: 'metadata',
  },

  // Non-person entities (should always pass)
  {
    type: 'company',
    value: 'Google',
    normalized: 'google',
    confidence: 0.95,
    source: 'body',
  },
  {
    type: 'project',
    value: 'AI Code Review',
    normalized: 'ai_code_review',
    confidence: 0.9,
    source: 'subject',
  },
];

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${LOG_PREFIX} Testing Post-Processing Filters`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`${LOG_PREFIX} Test data: ${testEntities.length} entities`);
  console.log(`  Valid persons: 3`);
  console.log(`  Email addresses: 2`);
  console.log(`  Company indicators: 4`);
  console.log(`  Single names: 3`);
  console.log(`  Non-person entities: 2\n`);

  // Apply filters
  const result = applyPostFilters(testEntities, {
    strictNameFormat: false,
    logFiltered: true,
  });

  console.log(`\n${'-'.repeat(80)}`);
  console.log(`${LOG_PREFIX} Test Results`);
  console.log(`${'-'.repeat(80)}\n`);

  console.log(`${LOG_PREFIX} Filtered entities (kept):`);
  result.filtered.forEach((entity) => {
    console.log(`  ✅ [${entity.type}] ${entity.value}`);
  });

  console.log(`\n${LOG_PREFIX} Removed entities:`);
  result.removed.forEach((entity) => {
    console.log(`  ❌ [${entity.type}] ${entity.value}`);
  });

  console.log(`\n${LOG_PREFIX} Reclassified entities:`);
  result.reclassified.forEach((entity) => {
    console.log(`  🔄 [person → ${entity.type}] ${entity.value}`);
  });

  console.log(`\n${'-'.repeat(80)}`);
  logFilterStats(result.stats);
  console.log(`${'-'.repeat(80)}\n`);

  // Verify expectations
  const expectedKept = 9; // 3 valid persons + 4 reclassified + 2 non-person entities
  const expectedFiltered = 5; // 2 emails + 3 single names
  const expectedReclassified = 4; // 4 company indicators (included in kept count)

  const passed =
    result.stats.kept === expectedKept &&
    result.stats.filtered === expectedFiltered &&
    result.stats.reclassified === expectedReclassified;

  if (passed) {
    console.log(`${LOG_PREFIX} ✅ All tests PASSED`);
    process.exit(0);
  } else {
    console.log(`${LOG_PREFIX} ❌ Tests FAILED`);
    console.log(`  Expected: kept=${expectedKept}, filtered=${expectedFiltered}, reclassified=${expectedReclassified}`);
    console.log(`  Got: kept=${result.stats.kept}, filtered=${result.stats.filtered}, reclassified=${result.stats.reclassified}`);
    process.exit(1);
  }
}

main();
