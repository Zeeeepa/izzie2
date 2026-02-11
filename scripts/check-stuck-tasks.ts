import { dbClient, schema } from "@/lib/db";
import { desc, gt } from "drizzle-orm";

const { agentTasks } = schema;

async function checkStuckTasks() {
  // Initialize database connection
  dbClient.initialize();
  const db = dbClient.getDb();

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const recentTasks = await db
    .select({
      id: agentTasks.id,
      userId: agentTasks.userId,
      agentType: agentTasks.agentType,
      status: agentTasks.status,
      progress: agentTasks.progress,
      currentStep: agentTasks.currentStep,
      createdAt: agentTasks.createdAt,
      startedAt: agentTasks.startedAt,
      errorMessage: agentTasks.errorMessage,
    })
    .from(agentTasks)
    .where(gt(agentTasks.createdAt, twoHoursAgo))
    .orderBy(desc(agentTasks.createdAt))
    .limit(20);

  console.log("\n=== Recent Agent Tasks (Last 2 Hours) ===\n");
  console.log("Total:", recentTasks.length);

  // Filter for research tasks
  const researchTasks = recentTasks.filter(t => t.agentType === 'research');
  console.log("Research Tasks:", researchTasks.length);
  console.log("\n");

  researchTasks.forEach((task, idx) => {
    console.log(`${idx + 1}. Task ${task.id.substring(0, 8)}...`);
    console.log(`   User: ${task.userId}`);
    console.log(`   Status: ${task.status}`);
    console.log(`   Progress: ${task.progress}%`);
    console.log(`   Current Step: ${task.currentStep || "none"}`);
    console.log(`   Created: ${task.createdAt.toISOString()}`);
    console.log(`   Started: ${task.startedAt?.toISOString() || "not started"}`);
    if (task.errorMessage) {
      console.log(`   ❌ Error: ${task.errorMessage}`);
    }
    console.log("");
  });

  const stuckTasks = researchTasks.filter(t => t.progress === 0 && t.status === "pending");
  console.log(`\n⚠️  Stuck at 0%: ${stuckTasks.length} tasks`);
  console.log(`✅ Completed: ${researchTasks.filter(t => t.status === "completed").length} tasks`);
  console.log(`🚧 In Progress: ${researchTasks.filter(t => t.status === "in_progress").length} tasks`);
  console.log(`❌ Failed: ${researchTasks.filter(t => t.status === "failed").length} tasks`);

  process.exit(0);
}

checkStuckTasks().catch(console.error);
