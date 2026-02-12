/**
 * Test Script for Autonomous Merge Implementation
 *
 * Tests the autonomous merge feature with sample data.
 * Usage: tsx scripts/test-autonomous-merge.ts
 */

import * as dotenv from 'dotenv';
import { findAndProcessDuplicates } from '../src/lib/entities/deduplication';
import { getMergeStats, AUTO_APPLY_THRESHOLD } from '../src/lib/entities/merge-service';

// Load environment variables
dotenv.config({ path: '.env.local' });

const TEST_USER_ID = process.env.TEST_USER_ID || 'test-user';

async function main() {
  console.log('🧪 Testing Autonomous Merge Implementation\n');
  console.log('═'.repeat(60));
  console.log(`Auto-apply threshold: ${AUTO_APPLY_THRESHOLD}`);
  console.log(`Test user ID: ${TEST_USER_ID}`);
  console.log('═'.repeat(60));
  console.log();

  try {
    // Step 1: Get initial statistics
    console.log('📊 Step 1: Getting initial merge statistics...');
    const statsBefore = await getMergeStats(TEST_USER_ID);
    console.log('Initial stats:', JSON.stringify(statsBefore, null, 2));
    console.log();

    // Step 2: Find and process duplicates
    console.log('🔍 Step 2: Finding and processing duplicates...');
    const result = await findAndProcessDuplicates(TEST_USER_ID, 0.7);
    console.log('Deduplication result:', JSON.stringify(result, null, 2));
    console.log();

    // Step 3: Get updated statistics
    console.log('📊 Step 3: Getting updated merge statistics...');
    const statsAfter = await getMergeStats(TEST_USER_ID);
    console.log('Updated stats:', JSON.stringify(statsAfter, null, 2));
    console.log();

    // Step 4: Analyze results
    console.log('📈 Step 4: Analysis');
    console.log('═'.repeat(60));

    if (result.totalFound === 0) {
      console.log('✅ No duplicates found - this is expected if:');
      console.log('   - No entities exist for test user');
      console.log('   - All entities have been deduplicated already');
      console.log('   - Entities are sufficiently different');
    } else {
      const autoApplyRate = (result.autoApplied / result.totalFound) * 100;
      console.log(`✅ Found ${result.totalFound} duplicates`);
      console.log(`✅ Auto-applied ${result.autoApplied} merges (${autoApplyRate.toFixed(1)}%)`);
      console.log(`✅ ${result.pendingReview} merges pending review (${(100 - autoApplyRate).toFixed(1)}%)`);

      if (autoApplyRate >= 50 && autoApplyRate <= 70) {
        console.log('🎯 Auto-apply rate is within target range (50-70%)');
      } else if (autoApplyRate > 70) {
        console.log('⚠️  Auto-apply rate is higher than expected (target: 60%)');
        console.log('   Consider raising the confidence threshold');
      } else {
        console.log('⚠️  Auto-apply rate is lower than expected (target: 60%)');
        console.log('   Consider lowering the confidence threshold or improving matching');
      }
    }

    console.log();
    console.log('✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
main();
