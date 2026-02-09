#!/usr/bin/env tsx
/**
 * Check research task system status
 *
 * Provides comprehensive status of:
 * - Database task status distribution
 * - Recent task activity
 * - System readiness for testing
 *
 * Usage:
 *   tsx scripts/check-research-status.ts
 */

import { dbClient } from '../src/lib/db/client';
import { agentTasks } from '../src/lib/db/schema';
import { eq, desc, sql, inArray, and, gte } from 'drizzle-orm';

async function main() {
  console.log('🔍 Research Task System Status\n');
  console.log('─'.repeat(60));
  console.log();

  const db = dbClient.getDb();

  // 1. Overall task statistics
  console.log('📊 Overall Task Statistics\n');

  const statusCounts = await db
    .select({
      status: agentTasks.status,
      count: sql<number>`count(*)::int`,
    })
    .from(agentTasks)
    .where(eq(agentTasks.agentType, 'research'))
    .groupBy(agentTasks.status);

  if (statusCounts.length === 0) {
    console.log('   No research tasks found in database.\n');
  } else {
    statusCounts.forEach(({ status, count }) => {
      const emoji = {
        pending: '⏳',
        running: '🏃',
        completed: '✅',
        failed: '❌',
        paused: '⏸️',
      }[status] || '❓';
      console.log(`   ${emoji} ${status.padEnd(10)} : ${count}`);
    });
    console.log();
  }

  // 2. Active tasks (pending or running)
  console.log('🔥 Active Tasks (Pending/Running)\n');

  const activeTasks = await db
    .select({
      id: agentTasks.id,
      status: agentTasks.status,
      progress: agentTasks.progress,
      currentStep: agentTasks.currentStep,
      createdAt: agentTasks.createdAt,
      startedAt: agentTasks.startedAt,
    })
    .from(agentTasks)
    .where(
      and(
        eq(agentTasks.agentType, 'research'),
        inArray(agentTasks.status, ['pending', 'running'])
      )
    )
    .orderBy(desc(agentTasks.createdAt))
    .limit(10);

  if (activeTasks.length === 0) {
    console.log('   ✅ No active tasks. System is idle.\n');
  } else {
    console.log(`   ⚠️  Found ${activeTasks.length} active task(s):\n`);
    activeTasks.forEach((task, index) => {
      const ageMinutes = Math.floor(
        (Date.now() - new Date(task.createdAt).getTime()) / (60 * 1000)
      );
      console.log(`   ${index + 1}. ${task.id}`);
      console.log(`      Status: ${task.status}`);
      console.log(`      Progress: ${task.progress}% ${task.currentStep ? `(${task.currentStep})` : ''}`);
      console.log(`      Age: ${ageMinutes}m`);
      console.log();
    });
  }

  // 3. Recent completions (last hour)
  console.log('✅ Recent Completions (Last Hour)\n');

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentCompletions = await db
    .select({
      id: agentTasks.id,
      status: agentTasks.status,
      completedAt: agentTasks.completedAt,
      error: agentTasks.error,
    })
    .from(agentTasks)
    .where(
      and(
        eq(agentTasks.agentType, 'research'),
        inArray(agentTasks.status, ['completed', 'failed']),
        gte(agentTasks.completedAt, oneHourAgo)
      )
    )
    .orderBy(desc(agentTasks.completedAt))
    .limit(10);

  if (recentCompletions.length === 0) {
    console.log('   No tasks completed in the last hour.\n');
  } else {
    console.log(`   Found ${recentCompletions.length} recent completion(s):\n`);
    recentCompletions.forEach((task, index) => {
      const emoji = task.status === 'completed' ? '✅' : '❌';
      const completedAgo = Math.floor(
        (Date.now() - new Date(task.completedAt!).getTime()) / (60 * 1000)
      );
      console.log(`   ${index + 1}. ${emoji} ${task.status} (${completedAgo}m ago)`);
      if (task.error) {
        const shortError = task.error.length > 60
          ? task.error.substring(0, 60) + '...'
          : task.error;
        console.log(`      Error: ${shortError}`);
      }
    });
    console.log();
  }

  // 4. System readiness assessment
  console.log('─'.repeat(60));
  console.log('🎯 System Readiness\n');

  const hasActiveTasksValue = activeTasks.length > 0;
  const hasRecentActivity = recentCompletions.length > 0;

  if (!hasActiveTasksValue && !hasRecentActivity) {
    console.log('   ✅ READY: No active tasks, no recent activity');
    console.log('   ✅ System is clean and ready for fresh testing\n');
  } else if (!hasActiveTasksValue && hasRecentActivity) {
    console.log('   ✅ READY: No active tasks');
    console.log('   ℹ️  Recent completions show system was recently active');
    console.log('   ✅ Safe to start new tests\n');
  } else {
    console.log('   ⚠️  WARNING: Active tasks detected');
    console.log('   ⚠️  Consider running clear-stuck-research-tasks.ts first\n');
  }

  // 5. Inngest integration notes
  console.log('─'.repeat(60));
  console.log('📝 Inngest Integration Notes\n');
  console.log('   • Concurrency limit: 1 (per user)');
  console.log('   • Retry limit: 2 attempts');
  console.log('   • Event: izzie/research.request');
  console.log('   • Function ID: research-task');
  console.log();
  console.log('   ℹ️  Inngest queue is managed by Inngest Cloud.');
  console.log('   ℹ️  Cleared database tasks will be skipped if already queued.');
  console.log();
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
