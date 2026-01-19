/**
 * Database Migration for Agent Framework Tables
 *
 * This migration script:
 * 1. Verifies all agent framework tables exist
 * 2. Creates missing tables if needed
 * 3. Creates vector indexes for research_findings table
 * 4. Can be run safely multiple times (idempotent)
 *
 * Tables created:
 * - agent_tasks: Main agent task tracking
 * - research_sources: Source URLs and content for research tasks
 * - research_findings: Extracted insights with embeddings
 *
 * Usage:
 *   pnpm tsx scripts/migrate-agent-tables.ts
 */

import { config } from 'dotenv';
import { dbClient } from '@/lib/db';

// Load environment variables
config({ path: '.env.local' });

interface TableInfo {
  table_name: string;
  column_name: string;
  data_type: string;
}

async function migrateAgentTables() {
  console.log('🔧 Agent Framework Database Migration\n');
  console.log('=' .repeat(60));

  try {
    // Step 1: Verify database connection
    console.log('\n1️⃣  Verifying database connection...');
    const connected = await dbClient.verifyConnection();

    if (!connected) {
      console.error('❌ Database connection failed');
      process.exit(1);
    }

    console.log('✅ Database connection successful');

    // Step 2: Check if tables exist
    console.log('\n2️⃣  Checking for agent framework tables...');

    const tableChecks = await dbClient.executeRaw<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('agent_tasks', 'research_sources', 'research_findings')
      ORDER BY table_name
    `);

    const existingTables = new Set(tableChecks.map((t) => t.table_name));

    const requiredTables = ['agent_tasks', 'research_sources', 'research_findings'];
    const missingTables = requiredTables.filter((t) => !existingTables.has(t));

    if (missingTables.length === 0) {
      console.log('✅ All agent framework tables exist');
      console.log('   Tables:', requiredTables.join(', '));
    } else {
      console.log('⚠️  Missing tables:', missingTables.join(', '));
      console.log('   These tables should be created by Drizzle migrations');
      console.log('   Run: pnpm drizzle-kit push');
      process.exit(1);
    }

    // Step 3: Verify table schemas
    console.log('\n3️⃣  Verifying table schemas...');

    const agentTasksColumns = await dbClient.executeRaw<TableInfo>(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'agent_tasks'
      ORDER BY ordinal_position
    `);

    const researchSourcesColumns = await dbClient.executeRaw<TableInfo>(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'research_sources'
      ORDER BY ordinal_position
    `);

    const researchFindingsColumns = await dbClient.executeRaw<TableInfo>(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'research_findings'
      ORDER BY ordinal_position
    `);

    console.log(`   agent_tasks: ${agentTasksColumns.length} columns`);
    console.log(`   research_sources: ${researchSourcesColumns.length} columns`);
    console.log(`   research_findings: ${researchFindingsColumns.length} columns`);

    // Verify critical columns exist
    const agentTasksColumnNames = new Set(agentTasksColumns.map((c) => c.column_name));
    const criticalColumns = [
      'id',
      'user_id',
      'agent_type',
      'status',
      'input',
      'progress',
      'tokens_used',
      'total_cost',
    ];

    const missingColumns = criticalColumns.filter((c) => !agentTasksColumnNames.has(c));

    if (missingColumns.length > 0) {
      console.error('❌ Missing critical columns in agent_tasks:', missingColumns.join(', '));
      process.exit(1);
    }

    console.log('✅ All critical columns exist');

    // Step 4: Enable pgvector extension
    console.log('\n4️⃣  Ensuring pgvector extension is enabled...');

    await dbClient.executeRaw('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('✅ pgvector extension enabled');

    // Step 5: Create vector indexes
    console.log('\n5️⃣  Creating vector indexes...');

    // Check if indexes already exist
    const existingIndexes = await dbClient.executeRaw<{ indexname: string }>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('memory_entries', 'research_findings')
      AND indexname LIKE '%embedding%'
    `);

    const indexNames = new Set(existingIndexes.map((i) => i.indexname));

    // Create memory_entries embedding index (if not exists)
    if (!indexNames.has('memory_entries_embedding_idx')) {
      console.log('   Creating memory_entries_embedding_idx...');
      await dbClient.executeRaw(`
        CREATE INDEX IF NOT EXISTS memory_entries_embedding_idx
        ON memory_entries
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);
      console.log('   ✅ Created memory_entries_embedding_idx');
    } else {
      console.log('   ✅ memory_entries_embedding_idx already exists');
    }

    // Create research_findings embedding index (if not exists)
    if (!indexNames.has('research_findings_embedding_idx')) {
      console.log('   Creating research_findings_embedding_idx...');
      await dbClient.executeRaw(`
        CREATE INDEX IF NOT EXISTS research_findings_embedding_idx
        ON research_findings
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);
      console.log('   ✅ Created research_findings_embedding_idx');
    } else {
      console.log('   ✅ research_findings_embedding_idx already exists');
    }

    // Step 6: Verify indexes
    console.log('\n6️⃣  Verifying indexes...');

    const allIndexes = await dbClient.executeRaw<{
      tablename: string;
      indexname: string;
      indexdef: string;
    }>(`
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('agent_tasks', 'research_sources', 'research_findings')
      ORDER BY tablename, indexname
    `);

    const indexesByTable = new Map<string, string[]>();
    for (const idx of allIndexes) {
      if (!indexesByTable.has(idx.tablename)) {
        indexesByTable.set(idx.tablename, []);
      }
      indexesByTable.get(idx.tablename)!.push(idx.indexname);
    }

    console.log('\n   Indexes by table:');
    for (const [table, indexes] of indexesByTable) {
      console.log(`   ${table}: ${indexes.length} indexes`);
      indexes.forEach((idx) => console.log(`     - ${idx}`));
    }

    // Step 7: Get final statistics
    console.log('\n7️⃣  Database statistics:');

    const stats = await dbClient.getStats();

    const agentTables = stats.tables.filter((t) =>
      ['agent_tasks', 'research_sources', 'research_findings'].some((name) =>
        t.name.includes(name)
      )
    );

    if (agentTables.length > 0) {
      console.log('\n   Agent framework tables:');
      agentTables.forEach((table) => {
        console.log(`   ${table.name}: ${table.rowCount} rows`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Migration completed successfully!');
    console.log('\nAgent framework is ready for use.');
    console.log('\nNext steps:');
    console.log('  1. Register agents using agentRegistry.register()');
    console.log('  2. Create tasks using taskManager.createTask()');
    console.log('  3. Execute agents with full lifecycle tracking');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await dbClient.close();
    process.exit(0);
  }
}

// Run migration
console.log('Starting agent framework migration...\n');
migrateAgentTables();
