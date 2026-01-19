/**
 * Check which migrations have been applied
 */

import { config } from 'dotenv';
import { dbClient } from '@/lib/db';

// Load environment
config({ path: '.env.local' });

async function checkMigrations() {
  console.log('🔍 Checking Migration Status\n');

  try {
    // Check if drizzle migrations table exists
    const tables = await dbClient.executeRaw<{ tablename: string }>(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename = '__drizzle_migrations'
    `);

    if (tables.length === 0) {
      console.log('⚠️  No migrations table found');
      console.log('   This means migrations have never been run.');
      console.log('\n📋 Expected tables from migration 0000_shallow_iron_fist:');
      console.log('   - users');
      console.log('   - conversations');
      console.log('   - memory_entries (⚠️  MISSING - needed for email extraction)');
      console.log('\n   Run: npm run db:migrate');
      return;
    }

    // Get applied migrations
    const migrations = await dbClient.executeRaw<{
      id: number;
      hash: string;
      created_at: string;
    }>(`
      SELECT * FROM __drizzle_migrations ORDER BY created_at
    `);

    console.log(`✅ Found ${migrations.length} applied migrations:\n`);
    migrations.forEach((m) => {
      console.log(`  ${m.id}. ${m.hash}`);
      console.log(`     Applied: ${new Date(m.created_at).toLocaleString()}`);
    });

    // Check which tables exist vs expected
    const allTables = await dbClient.executeRaw<{ tablename: string }>(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log('\n📊 Current Database Tables:');
    allTables.forEach((t) => {
      console.log(`  ✅ ${t.tablename}`);
    });

    const expectedTables = ['users', 'conversations', 'memory_entries'];
    const existingTableNames = allTables.map((t) => t.tablename);
    const missing = expectedTables.filter((t) => !existingTableNames.includes(t));

    if (missing.length > 0) {
      console.log('\n⚠️  Missing Expected Tables:');
      missing.forEach((t) => {
        console.log(`  ❌ ${t}`);
      });
      console.log('\n  Run: npm run db:migrate');
    } else {
      console.log('\n✅ All expected tables present!');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await dbClient.close();
    process.exit(0);
  }
}

checkMigrations();
