/**
 * Remove the old expires_at column from accounts table
 * Now that we have access_token_expires_at and refresh_token_expires_at
 */

import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function cleanupOldColumn() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');
  const pool = new Pool({ connectionString });

  try {
    // Check if old column exists
    const checkResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'accounts' AND column_name = 'expires_at';
    `);

    if (checkResult.rows.length > 0) {
      console.log('🔧 Dropping old expires_at column...');
      await pool.query(`
        ALTER TABLE accounts
        DROP COLUMN expires_at;
      `);
      console.log('✅ Old column removed successfully');
    } else {
      console.log('✅ expires_at column already removed');
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('👋 Database connection closed');
  }
}

// Run the cleanup
cleanupOldColumn();
