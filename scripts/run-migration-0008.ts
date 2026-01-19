/**
 * Manual migration runner for migration 0008
 * Adds extraction_progress table
 */

import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in environment variables');
    console.error('Please set DATABASE_URL in your .env.local file');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');

  const pool = new Pool({ connectionString });

  try {
    // Read the migration file
    const migrationSQL = readFileSync(
      join(process.cwd(), 'drizzle/migrations/0008_add_extraction_progress.sql'),
      'utf-8'
    );

    console.log('🚀 Running migration 0008_add_extraction_progress...');
    console.log('SQL:', migrationSQL.substring(0, 200) + '...\n');

    await pool.query(migrationSQL);

    console.log('✅ Migration 0008 completed successfully');
    console.log('\n📊 Table created: extraction_progress');
    console.log('   - Tracks extraction progress for email, calendar, drive');
    console.log('   - Unique constraint on (userId, source)');
    console.log('   - Indexes on userId, source, status');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);

    // Check if table already exists
    if (error.code === '42P07') {
      console.log('\n⚠️  Table already exists, checking structure...');

      const checkResult = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'extraction_progress'
        ORDER BY ordinal_position;
      `);

      console.log('\n📋 Current table structure:');
      console.table(checkResult.rows);
    } else {
      process.exit(1);
    }
  } finally {
    await pool.end();
    console.log('👋 Database connection closed');
  }
}

// Run migration
runMigration();
