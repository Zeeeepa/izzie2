/**
 * Check Database Status
 *
 * Verifies database connection and lists existing tables
 */

import { config } from 'dotenv';
import { dbClient } from '@/lib/db';

// Load environment
config({ path: '.env.local' });

async function checkDatabaseStatus() {
  console.log('🔍 Checking Database Status\n');
  console.log('=' .repeat(60));

  try {
    // Verify connection
    console.log('\n1️⃣  Testing connection...');
    const connected = await dbClient.verifyConnection();

    if (!connected) {
      console.error('❌ Database connection failed');
      process.exit(1);
    }

    console.log('✅ Database connection successful');

    // Get database statistics
    console.log('\n2️⃣  Database Statistics:');
    const stats = await dbClient.getStats();

    console.log('\nTables:');
    if (stats.tables.length === 0) {
      console.log('  ⚠️  No tables found - migrations not run yet');
    } else {
      stats.tables.forEach((table) => {
        console.log(`  ${table.name}: ${table.rowCount} rows`);
      });
    }

    console.log('\nExtensions:');
    if (stats.extensions.length === 0) {
      console.log('  ⚠️  No extensions installed');
    } else {
      stats.extensions.forEach((ext) => {
        console.log(`  ✅ ${ext}`);
      });
    }

    console.log('\nIndexes:');
    if (stats.indexes.length === 0) {
      console.log('  ⚠️  No indexes found');
    } else {
      const groupedIndexes = new Map<string, Array<{ name: string; type: string }>>();
      stats.indexes.forEach((idx) => {
        if (!groupedIndexes.has(idx.table)) {
          groupedIndexes.set(idx.table, []);
        }
        groupedIndexes.get(idx.table)!.push({ name: idx.name, type: idx.type });
      });

      groupedIndexes.forEach((indexes, table) => {
        console.log(`\n  ${table}:`);
        indexes.forEach((idx) => {
          console.log(`    - ${idx.name} (${idx.type})`);
        });
      });
    }

    console.log('\n' + '='.repeat(60));

    // Check if migrations need to be run
    if (stats.tables.length === 0) {
      console.log('\n⚠️  ACTION REQUIRED: Run database migrations');
      console.log('   Command: npm run db:migrate');
    } else {
      console.log('\n✅ Database is ready');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await dbClient.close();
    process.exit(0);
  }
}

// Run the check
checkDatabaseStatus();
