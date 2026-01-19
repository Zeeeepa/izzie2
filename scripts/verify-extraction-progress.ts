/**
 * Verify extraction_progress table structure
 */

import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function verify() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔍 Verifying extraction_progress table...\n');

    // Check table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'extraction_progress'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('❌ Table extraction_progress does not exist');
      process.exit(1);
    }

    console.log('✅ Table exists\n');

    // Get column structure
    const columns = await pool.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'extraction_progress'
      ORDER BY ordinal_position;
    `);

    console.log('📋 Column structure:');
    console.table(columns.rows);

    // Get indexes
    const indexes = await pool.query(`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'extraction_progress'
      ORDER BY indexname;
    `);

    console.log('\n🔑 Indexes:');
    console.table(indexes.rows);

    // Get constraints
    const constraints = await pool.query(`
      SELECT
        conname as constraint_name,
        contype as constraint_type,
        pg_get_constraintdef(c.oid) as definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'extraction_progress'::regclass
      ORDER BY contype, conname;
    `);

    console.log('\n🔒 Constraints:');
    console.table(constraints.rows);

    console.log('\n✅ Table structure verified successfully');
  } catch (error: any) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verify();
