/**
 * Sync Migration Tracking
 *
 * Use this script when tables were created via sync-tables.ts but Drizzle's
 * migration tracking is out of sync. This marks all migrations as applied
 * in the drizzle.__drizzle_migrations table.
 *
 * Drizzle-ORM uses a table in the 'drizzle' schema, not 'public'.
 *
 * Usage: npx tsx scripts/sync-migration-tracking.ts
 *
 * When to use:
 * - After running sync-tables.ts on a fresh database
 * - When migrations fail with "relation already exists" errors
 * - After restoring a database backup that doesn't have migration tracking
 *
 * Note: Update the ALL_MIGRATIONS array when adding new migrations.
 */

import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const ALL_MIGRATIONS = [
  '0000_shallow_iron_fist',
  '0001_nosy_taskmaster',
  '0002_calm_whirlwind',
  '0003_woozy_maria_hill',
  '0004_greedy_skrulls',
  '0005_talented_excalibur',
  '0006_curly_tattoo',
  '0007_fix_accounts_schema',
  '0008_add_extraction_progress',
  '0009_add_chat_sessions',
  '0010_add_telegram_tables',
  '0011_add_digest_tables',
  '0012_add_user_preferences',
  '0013_add_account_metadata',
  '0014_add_agent_tables',
  '0015_add_alert_preferences',
  '0016_add_notification_history',
  '0017_add_notification_queue',
  '0018_add_organization_tables',
  '0019_add_mcp_tool_embeddings',
  '0020_add_sent_reminders',
  '0021_add_usage_tracking',
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Check current state in drizzle schema
    console.log('Checking drizzle schema migrations table...');
    const current = await pool.query(`
      SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at
    `);
    console.log(`Found ${current.rows.length} applied migrations in drizzle schema.`);
    if (current.rows.length > 0) {
      console.log('Existing migrations:', current.rows.map((r: { hash: string }) => r.hash));
    }

    // Check which migrations need to be inserted
    const existingHashes = new Set(current.rows.map((r: { hash: string }) => r.hash));
    const toInsert = ALL_MIGRATIONS.filter(m => !existingHashes.has(m));

    if (toInsert.length === 0) {
      console.log('\nAll migrations are already marked as applied in drizzle schema.');
      return;
    }

    console.log(`\nInserting ${toInsert.length} migrations into drizzle schema:`);

    // Use incrementing timestamps to maintain order
    let timestamp = Date.now() - (toInsert.length * 1000);

    for (const migration of toInsert) {
      console.log(`  Inserting: ${migration}`);
      await pool.query(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
        [migration, timestamp]
      );
      timestamp += 1000;
    }

    console.log('\nDone! Verifying...');

    const after = await pool.query(`
      SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at
    `);

    console.log(`\nNow have ${after.rows.length} migrations in drizzle schema:`);
    after.rows.forEach((row: { hash: string }) => {
      console.log(`  - ${row.hash}`);
    });

    // Clean up the public schema table if it exists
    console.log('\nCleaning up duplicate table in public schema...');
    await pool.query('DROP TABLE IF EXISTS public.__drizzle_migrations');
    console.log('Done - removed public.__drizzle_migrations');

  } finally {
    await pool.end();
  }
}

main();
