#!/usr/bin/env tsx
/**
 * Clear stuck research tasks from the database
 *
 * This script:
 * 1. Identifies tasks stuck in 'pending' or 'running' status
 * 2. Marks them as 'failed' with cleanup message
 * 3. Provides statistics on cleared tasks
 *
 * Usage:
 *   tsx scripts/clear-stuck-research-tasks.ts [--dry-run] [--age-minutes=5]
 */

import { dbClient } from '../src/lib/db/client';
import { agentTasks } from '../src/lib/db/schema';
import { eq, and, lt, inArray, sql } from 'drizzle-orm';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const ageMinutesArg = args.find(arg => arg.startsWith('--age-minutes='));
const ageMinutes = ageMinutesArg ? parseInt(ageMinutesArg.split('=')[1]) : 5;

async function main() {
  console.log('🔍 Checking for stuck research tasks...\n');
  console.log(`Configuration:`);
  console.log(`  - Dry run: ${isDryRun ? 'YES' : 'NO'}`);
  console.log(`  - Clear tasks older than: ${ageMinutes} minutes`);
  console.log(`  - Cutoff time: ${new Date(Date.now() - ageMinutes * 60 * 1000).toISOString()}\n`);

  const db = dbClient.getDb();
  const cutoffTime = new Date(Date.now() - ageMinutes * 60 * 1000);

  // Step 1: Check for stuck tasks
  console.log('📊 Step 1: Analyzing stuck tasks\n');

  const stuckPendingTasks = await db
    .select({
      id: agentTasks.id,
      agentType: agentTasks.agentType,
      status: agentTasks.status,
      progress: agentTasks.progress,
      currentStep: agentTasks.currentStep,
      createdAt: agentTasks.createdAt,
      startedAt: agentTasks.startedAt,
    })
    .from(agentTasks)
    .where(
      and(
        eq(agentTasks.status, 'pending'),
        lt(agentTasks.createdAt, cutoffTime)
      )
    )
    .orderBy(agentTasks.createdAt);

  const stuckRunningTasks = await db
    .select({
      id: agentTasks.id,
      agentType: agentTasks.agentType,
      status: agentTasks.status,
      progress: agentTasks.progress,
      currentStep: agentTasks.currentStep,
      createdAt: agentTasks.createdAt,
      startedAt: agentTasks.startedAt,
    })
    .from(agentTasks)
    .where(
      and(
        eq(agentTasks.status, 'running'),
        lt(sql`COALESCE(${agentTasks.startedAt}, ${agentTasks.createdAt})`, cutoffTime)
      )
    )
    .orderBy(agentTasks.createdAt);

  const allStuckTasks = [...stuckPendingTasks, ...stuckRunningTasks];

  if (allStuckTasks.length === 0) {
    console.log('✅ No stuck tasks found. Database is clean!\n');

    // Show current status distribution
    const statusCounts = await db
      .select({
        status: agentTasks.status,
        count: sql<number>`count(*)::int`,
      })
      .from(agentTasks)
      .groupBy(agentTasks.status);

    console.log('📈 Current task status distribution:');
    statusCounts.forEach(({ status, count }) => {
      console.log(`   - ${status}: ${count}`);
    });
    console.log();

    return;
  }

  // Display stuck tasks
  console.log(`⚠️  Found ${allStuckTasks.length} stuck task(s):\n`);

  allStuckTasks.forEach((task, index) => {
    const ageMinutes = Math.floor(
      (Date.now() - new Date(task.createdAt).getTime()) / (60 * 1000)
    );
    console.log(`${index + 1}. Task ${task.id}`);
    console.log(`   Status: ${task.status}`);
    console.log(`   Agent: ${task.agentType}`);
    console.log(`   Progress: ${task.progress}% ${task.currentStep ? `(${task.currentStep})` : ''}`);
    console.log(`   Created: ${task.createdAt} (${ageMinutes}m ago)`);
    if (task.startedAt) {
      const runningMinutes = Math.floor(
        (Date.now() - new Date(task.startedAt).getTime()) / (60 * 1000)
      );
      console.log(`   Started: ${task.startedAt} (${runningMinutes}m ago)`);
    }
    console.log();
  });

  // Step 2: Clear stuck tasks
  if (!isDryRun) {
    console.log('🧹 Step 2: Clearing stuck tasks\n');

    const taskIds = allStuckTasks.map(t => t.id);
    const clearTime = new Date();

    const result = await db
      .update(agentTasks)
      .set({
        status: 'failed',
        completedAt: clearTime,
        error: 'Cleared during serialization fix deployment - task was stuck',
        updatedAt: clearTime,
      })
      .where(inArray(agentTasks.id, taskIds))
      .returning({ id: agentTasks.id });

    console.log(`✅ Cleared ${result.length} task(s)\n`);

    // Step 3: Verify cleanup
    console.log('✔️  Step 3: Verifying database state\n');

    const remainingStuck = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(agentTasks)
      .where(inArray(agentTasks.status, ['pending', 'running']));

    console.log(`Remaining active tasks: ${remainingStuck[0].count}`);

    // Final status distribution
    const statusCounts = await db
      .select({
        status: agentTasks.status,
        count: sql<number>`count(*)::int`,
      })
      .from(agentTasks)
      .groupBy(agentTasks.status);

    console.log('\n📈 Final task status distribution:');
    statusCounts.forEach(({ status, count }) => {
      console.log(`   - ${status}: ${count}`);
    });
    console.log();

    console.log('✅ Database cleanup complete!\n');
    console.log('🎯 System ready for fresh testing.');
  } else {
    console.log('🔍 Dry run mode - no changes made.\n');
    console.log('To actually clear these tasks, run without --dry-run flag.');
  }
}

main()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
