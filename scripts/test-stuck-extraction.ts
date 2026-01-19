/**
 * Test Script: Stuck Extraction Detection and Reset
 *
 * This script:
 * 1. Creates a stuck extraction (calendar with old lastRunAt)
 * 2. Tests stale detection
 * 3. Tests reset functionality
 */

import { dbClient } from '@/lib/db';
import { extractionProgress } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  isExtractionStale,
  getEffectiveStatus,
  resetStaleExtractions,
} from '@/lib/extraction/progress';

const TEST_USER_ID = 'tlHWmrogZXPR91lqdGO1fXM02j92rVDF';

async function main() {
  const db = dbClient.getDb();

  console.log('=== Step 1: Create Stuck Extraction ===\n');

  // Set calendar to stuck state (running but last activity 10 minutes ago)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  await db
    .update(extractionProgress)
    .set({
      status: 'running',
      lastRunAt: tenMinutesAgo,
      totalItems: 0,
      processedItems: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(extractionProgress.userId, TEST_USER_ID),
        eq(extractionProgress.source, 'calendar')
      )
    );

  console.log(`✅ Set calendar extraction to:`);
  console.log(`   - status: running`);
  console.log(`   - lastRunAt: ${tenMinutesAgo.toISOString()}`);
  console.log(`   - (10 minutes ago - should be detected as stale)`);

  console.log('\n=== Step 2: Test Stale Detection ===\n');

  const allProgress = await db.select().from(extractionProgress);

  allProgress.forEach((progress) => {
    const stale = isExtractionStale(progress);
    const effectiveStatus = getEffectiveStatus(progress);

    console.log(`${progress.source}:`);
    console.log(`  - Database status: ${progress.status}`);
    console.log(`  - Is stale: ${stale}`);
    console.log(`  - Effective status: ${effectiveStatus}`);
    console.log(`  - Last run: ${progress.lastRunAt}`);

    if (progress.source === 'calendar') {
      if (stale) {
        console.log('  ✅ PASS: Calendar correctly detected as stale');
      } else {
        console.log('  ❌ FAIL: Calendar should be detected as stale');
      }

      if (effectiveStatus === 'error') {
        console.log('  ✅ PASS: Effective status correctly set to error');
      } else {
        console.log('  ❌ FAIL: Effective status should be error');
      }
    }
    console.log('');
  });

  console.log('=== Step 3: Test Reset Stale Extractions ===\n');

  const resetCount = await resetStaleExtractions();
  console.log(`✅ Reset ${resetCount} stale extraction(s)`);

  if (resetCount > 0) {
    console.log('✅ PASS: resetStaleExtractions found and reset stuck extractions\n');
  } else {
    console.log('❌ FAIL: resetStaleExtractions should have reset at least 1 extraction\n');
  }

  console.log('=== Step 4: Verify Database After Reset ===\n');

  const afterReset = await db
    .select()
    .from(extractionProgress)
    .where(
      and(
        eq(extractionProgress.userId, TEST_USER_ID),
        eq(extractionProgress.source, 'calendar')
      )
    );

  const calendar = afterReset[0];
  console.log('Calendar extraction after reset:');
  console.log(`  - status: ${calendar.status}`);
  console.log(`  - lastRunAt: ${calendar.lastRunAt}`);
  console.log(`  - updatedAt: ${calendar.updatedAt}`);

  if (calendar.status === 'error') {
    console.log('\n✅ PASS: Status correctly updated to error');
  } else {
    console.log('\n❌ FAIL: Status should be error after reset');
  }

  console.log('\n=== Summary ===\n');
  console.log('All tests completed. Check results above.');

  await dbClient.close();
}

main().catch((error) => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
