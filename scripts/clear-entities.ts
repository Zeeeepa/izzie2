/**
 * Clear Entity Data Script
 *
 * Clears all entity/memory data from the database to prepare for fresh extraction.
 * This script:
 * 1. Connects to the database
 * 2. Shows current row counts
 * 3. Clears memory_entries table
 * 4. Verifies the data was cleared
 *
 * Usage: npx tsx scripts/clear-entities.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { dbClient } from '../src/lib/db/client';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  console.log('🧹 Entity Data Cleanup Script\n');
  console.log('=' .repeat(60));

  try {
    // Initialize database connection
    console.log('\n📡 Connecting to database...');
    dbClient.initialize();
    const isConnected = await dbClient.verifyConnection();

    if (!isConnected) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }
    console.log('✅ Connected to database\n');

    // Get current statistics
    console.log('📊 Current database state:');
    console.log('-'.repeat(60));

    const beforeStats = await dbClient.getStats();
    const memoryTable = beforeStats.tables.find(t => t.name.includes('memory_entries'));
    const conversationsTable = beforeStats.tables.find(t => t.name.includes('conversations'));

    console.log(`  memory_entries:  ${memoryTable?.rowCount || 0} rows`);
    console.log(`  conversations:   ${conversationsTable?.rowCount || 0} rows`);
    console.log();

    // Ask for confirmation in production-like scenarios
    if (memoryTable && memoryTable.rowCount > 100) {
      console.log('⚠️  WARNING: This will delete', memoryTable.rowCount, 'memory entries!');
      console.log('   Proceeding in 3 seconds...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Clear memory_entries table
    console.log('🗑️  Clearing memory_entries table...');
    await dbClient.executeRaw('TRUNCATE TABLE memory_entries CASCADE');
    console.log('✅ memory_entries cleared\n');

    // Optionally clear conversations (they're likely tied to the entities)
    console.log('🗑️  Clearing conversations table...');
    await dbClient.executeRaw('TRUNCATE TABLE conversations CASCADE');
    console.log('✅ conversations cleared\n');

    // Verify cleanup
    console.log('🔍 Verifying cleanup:');
    console.log('-'.repeat(60));

    const afterStats = await dbClient.getStats();
    const memoryAfter = afterStats.tables.find(t => t.name.includes('memory_entries'));
    const conversationsAfter = afterStats.tables.find(t => t.name.includes('conversations'));

    console.log(`  memory_entries:  ${memoryAfter?.rowCount || 0} rows`);
    console.log(`  conversations:   ${conversationsAfter?.rowCount || 0} rows`);
    console.log();

    // Summary
    console.log('=' .repeat(60));
    console.log('✨ Cleanup Complete!\n');
    console.log('Summary:');
    console.log(`  • Deleted ${memoryTable?.rowCount || 0} memory entries`);
    console.log(`  • Deleted ${conversationsTable?.rowCount || 0} conversations`);
    console.log(`  • Database is ready for fresh extraction\n`);

    // Close connection
    await dbClient.close();

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
