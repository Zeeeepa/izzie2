#!/usr/bin/env tsx
/**
 * Clear Entity Data Script (Simple Version)
 *
 * Clears all entity/memory data from the database to prepare for fresh extraction.
 *
 * Usage: npx tsx scripts/clear-entities-simple.ts
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

    // Get current row counts using simple queries
    console.log('📊 Current database state:');
    console.log('-'.repeat(60));

    const memoryBefore = await dbClient.executeRaw<{ count: string }>(
      'SELECT COUNT(*) as count FROM memory_entries'
    );
    const conversationsBefore = await dbClient.executeRaw<{ count: string }>(
      'SELECT COUNT(*) as count FROM conversations'
    );

    const memoryCount = parseInt(memoryBefore[0]?.count || '0', 10);
    const conversationsCount = parseInt(conversationsBefore[0]?.count || '0', 10);

    console.log(`  memory_entries:  ${memoryCount} rows`);
    console.log(`  conversations:   ${conversationsCount} rows`);
    console.log();

    // Ask for confirmation if there's a lot of data
    if (memoryCount > 100) {
      console.log('⚠️  WARNING: This will delete', memoryCount, 'memory entries!');
      console.log('   Proceeding in 3 seconds...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Clear memory_entries table
    console.log('🗑️  Clearing memory_entries table...');
    await dbClient.executeRaw('TRUNCATE TABLE memory_entries CASCADE');
    console.log('✅ memory_entries cleared\n');

    // Clear conversations table
    console.log('🗑️  Clearing conversations table...');
    await dbClient.executeRaw('TRUNCATE TABLE conversations CASCADE');
    console.log('✅ conversations cleared\n');

    // Verify cleanup
    console.log('🔍 Verifying cleanup:');
    console.log('-'.repeat(60));

    const memoryAfter = await dbClient.executeRaw<{ count: string }>(
      'SELECT COUNT(*) as count FROM memory_entries'
    );
    const conversationsAfter = await dbClient.executeRaw<{ count: string }>(
      'SELECT COUNT(*) as count FROM conversations'
    );

    console.log(`  memory_entries:  ${memoryAfter[0]?.count || 0} rows`);
    console.log(`  conversations:   ${conversationsAfter[0]?.count || 0} rows`);
    console.log();

    // Summary
    console.log('=' .repeat(60));
    console.log('✨ Cleanup Complete!\n');
    console.log('Summary:');
    console.log(`  • Deleted ${memoryCount} memory entries`);
    console.log(`  • Deleted ${conversationsCount} conversations`);
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
