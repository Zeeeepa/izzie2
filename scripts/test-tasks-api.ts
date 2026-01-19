/**
 * Test Google Tasks API Integration
 * Run with: npx tsx scripts/test-tasks-api.ts
 */

import { listTaskLists, fetchAllTasks } from '@/lib/google/tasks';

async function testTasksAPI() {
  console.log('🧪 Testing Google Tasks API Integration\n');

  // Get user ID from environment
  const userId = process.env.DEFAULT_USER_ID || process.env.TEST_USER_ID;

  if (!userId) {
    console.error('❌ Error: DEFAULT_USER_ID or TEST_USER_ID environment variable required');
    console.log('   Set it to a valid user ID that has Google OAuth tokens in the database');
    process.exit(1);
  }

  console.log(`📋 Testing with user ID: ${userId}\n`);

  try {
    // Test 1: List all task lists
    console.log('1️⃣ Listing all task lists...');
    const { taskLists, nextPageToken } = await listTaskLists(userId, {
      maxResults: 10,
    });

    console.log(`✅ Found ${taskLists.length} task lists`);
    taskLists.forEach((list, i) => {
      console.log(`   ${i + 1}. ${list.title} (${list.id})`);
    });

    if (nextPageToken) {
      console.log(`   📄 Next page token: ${nextPageToken}`);
    }

    console.log('');

    // Test 2: Fetch all tasks from all lists
    console.log('2️⃣ Fetching all tasks from all lists...');
    const allTasks = await fetchAllTasks(userId, {
      maxTasksPerList: 50,
      showCompleted: true,
      showHidden: false,
    });

    console.log(`✅ Found ${allTasks.length} total tasks across all lists`);

    // Group by list
    const tasksByList = allTasks.reduce(
      (acc, { taskListTitle }) => {
        acc[taskListTitle] = (acc[taskListTitle] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    console.log('\n📊 Tasks by list:');
    Object.entries(tasksByList).forEach(([listTitle, count]) => {
      console.log(`   - ${listTitle}: ${count} task(s)`);
    });

    // Show sample tasks
    if (allTasks.length > 0) {
      console.log('\n📝 Sample tasks:');
      allTasks.slice(0, 5).forEach(({ task, taskListTitle }, i) => {
        console.log(`   ${i + 1}. [${taskListTitle}] ${task.title}`);
        if (task.notes) {
          console.log(`      Notes: ${task.notes.substring(0, 50)}${task.notes.length > 50 ? '...' : ''}`);
        }
        if (task.due) {
          console.log(`      Due: ${new Date(task.due).toLocaleDateString()}`);
        }
        console.log(`      Status: ${task.status}`);
      });
    }

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run tests
testTasksAPI().catch(console.error);
