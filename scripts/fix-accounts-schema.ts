/**
 * Fix accounts table schema for Better Auth
 *
 * This script directly migrates the accounts table to add:
 * - access_token_expires_at (rename from expires_at)
 * - refresh_token_expires_at (new column)
 */

import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function fixAccountsSchema() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');
  const pool = new Pool({ connectionString });

  try {
    // Check current table structure
    console.log('🔍 Checking current accounts table structure...');
    const checkResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'accounts'
      ORDER BY ordinal_position;
    `);

    console.log('Current columns:', checkResult.rows);

    // Check if migration is needed
    const hasOldColumn = checkResult.rows.some((row: any) => row.column_name === 'expires_at');
    const hasAccessTokenExpiresAt = checkResult.rows.some((row: any) => row.column_name === 'access_token_expires_at');
    const hasRefreshTokenExpiresAt = checkResult.rows.some((row: any) => row.column_name === 'refresh_token_expires_at');

    if (hasOldColumn && !hasAccessTokenExpiresAt) {
      console.log('🔧 Renaming expires_at to access_token_expires_at...');
      await pool.query(`
        ALTER TABLE accounts
        RENAME COLUMN expires_at TO access_token_expires_at;
      `);
      console.log('✅ Column renamed successfully');
    } else if (hasAccessTokenExpiresAt) {
      console.log('✅ access_token_expires_at already exists');
    }

    if (!hasRefreshTokenExpiresAt) {
      console.log('🔧 Adding refresh_token_expires_at column...');
      await pool.query(`
        ALTER TABLE accounts
        ADD COLUMN refresh_token_expires_at timestamp;
      `);
      console.log('✅ Column added successfully');
    } else {
      console.log('✅ refresh_token_expires_at already exists');
    }

    // Verify final structure
    console.log('\n🔍 Verifying final structure...');
    const finalResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'accounts'
      ORDER BY ordinal_position;
    `);

    console.log('Final columns:', finalResult.rows);
    console.log('\n✅ Accounts table schema fixed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('👋 Database connection closed');
  }
}

// Run the fix
fixAccountsSchema();
