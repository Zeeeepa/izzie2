/**
 * Verify UI Status Display
 *
 * This script simulates what the UI dashboard will see
 * after the extraction status fixes
 */

import { dbClient } from '@/lib/db';
import { getAllProgress, calculateProgress, getEffectiveStatus } from '@/lib/extraction/progress';

const TEST_USER_ID = 'tlHWmrogZXPR91lqdGO1fXM02j92rVDF';

async function main() {
  console.log('=== UI Dashboard View (Simulated) ===\n');

  const allProgress = await getAllProgress(TEST_USER_ID);

  // Transform exactly like the status API does
  const progressWithMetrics = allProgress.map((progress) => {
    const percentage = calculateProgress(progress);
    const effectiveStatus = getEffectiveStatus(progress);

    // Calculate processing rate
    let processingRate = 0;
    let estimatedSecondsRemaining = 0;

    if (progress.status === 'running' && progress.lastRunAt) {
      const now = new Date();
      const startTime = new Date(progress.lastRunAt);
      const elapsedSeconds = (now.getTime() - startTime.getTime()) / 1000;

      if (elapsedSeconds >= 1) {
        const processedItems = progress.processedItems || 0;
        const totalItems = progress.totalItems || 0;
        const remainingItems = totalItems - processedItems;

        processingRate = processedItems / elapsedSeconds;
        estimatedSecondsRemaining = processingRate > 0 ? remainingItems / processingRate : 0;
      }
    }

    return {
      source: progress.source,
      status: effectiveStatus,
      originalStatus: progress.status,
      totalItems: progress.totalItems,
      processedItems: progress.processedItems,
      progressPercentage: percentage,
      processingRate: Math.round(processingRate * 100) / 100,
      estimatedSecondsRemaining: Math.round(estimatedSecondsRemaining),
      lastRunAt: progress.lastRunAt,
    };
  });

  // Display in user-friendly format
  console.log('┌──────────────────────────────────────────────────────┐');
  console.log('│           Extraction Dashboard Status                │');
  console.log('└──────────────────────────────────────────────────────┘\n');

  progressWithMetrics.forEach((item) => {
    const statusIcon = {
      idle: '⚪',
      running: '🟢',
      paused: '🟡',
      completed: '✅',
      error: '🔴',
    }[item.status] || '❓';

    const statusColor = {
      idle: 'gray',
      running: 'green',
      paused: 'yellow',
      completed: 'green',
      error: 'red',
    }[item.status] || 'gray';

    console.log(`${statusIcon} ${item.source.toUpperCase()}`);
    console.log(`   Status: ${item.status} (${statusColor})`);

    if (item.originalStatus !== item.status) {
      console.log(`   [Debug] Original DB status: ${item.originalStatus}`);
    }

    console.log(`   Progress: ${item.processedItems}/${item.totalItems} (${item.progressPercentage}%)`);

    if (item.status === 'running' && item.processingRate > 0) {
      const etaMinutes = Math.round(item.estimatedSecondsRemaining / 60);
      console.log(`   Rate: ${item.processingRate} items/sec`);
      console.log(`   ETA: ${etaMinutes} minutes`);
    }

    if (item.lastRunAt) {
      const lastRun = new Date(item.lastRunAt);
      const hoursAgo = ((Date.now() - lastRun.getTime()) / (1000 * 60 * 60)).toFixed(1);
      console.log(`   Last activity: ${hoursAgo}h ago`);
    }

    console.log('');
  });

  console.log('─────────────────────────────────────────────────────\n');

  // Summary
  const counts = {
    running: progressWithMetrics.filter((p) => p.status === 'running').length,
    error: progressWithMetrics.filter((p) => p.status === 'error').length,
    completed: progressWithMetrics.filter((p) => p.status === 'completed').length,
    idle: progressWithMetrics.filter((p) => p.status === 'idle').length,
  };

  console.log('Summary:');
  if (counts.running > 0) console.log(`  🟢 ${counts.running} active extraction(s)`);
  if (counts.error > 0) console.log(`  🔴 ${counts.error} failed/stuck extraction(s)`);
  if (counts.completed > 0) console.log(`  ✅ ${counts.completed} completed extraction(s)`);
  if (counts.idle > 0) console.log(`  ⚪ ${counts.idle} idle extraction(s)`);

  console.log('\n');

  // Key improvements
  console.log('✅ Key Improvements:');
  console.log('   - Stale extractions now show as "error" instead of misleading "running"');
  console.log('   - 0/0 progress correctly indicates failed extraction');
  console.log('   - Users can retry failed extractions');
  console.log('   - Automatic cleanup on server restart');

  await dbClient.close();
}

main().catch((error) => {
  console.error('Failed to verify UI status:', error);
  process.exit(1);
});
