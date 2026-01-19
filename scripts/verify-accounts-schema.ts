/**
 * Verify accounts table schema is correct for Better Auth
 */

import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function verifySchema() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');
  const pool = new Pool({ connectionString });

  try {
    console.log('🔍 Checking accounts table schema...\n');

    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'accounts'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows;

    // Required columns for Better Auth
    const requiredColumns = [
      'id',
      'user_id',
      'account_id',
      'provider_id',
      'access_token',
      'refresh_token',
      'id_token',
      'access_token_expires_at', // ← Must exist
      'refresh_token_expires_at', // ← Must exist
      'scope',
      'password',
      'created_at',
      'updated_at',
    ];

    // Check for required columns
    let allGood = true;
    console.log('Required Columns Check:');
    console.log('=' . repeat(60));

    for (const col of requiredColumns) {
      const found = columns.find((c: any) => c.column_name === col);
      if (found) {
        console.log(`✅ ${col.padEnd(30)} (${found.data_type})`);
      } else {
        console.log(`❌ ${col.padEnd(30)} MISSING!`);
        allGood = false;
      }
    }

    // Check for old column that should NOT exist
    console.log('\n' + '=' . repeat(60));
    console.log('Deprecated Column Check:');
    console.log('=' . repeat(60));

    const oldColumn = columns.find((c: any) => c.column_name === 'expires_at');
    if (oldColumn) {
      console.log('❌ expires_at column still exists (should be removed)');
      allGood = false;
    } else {
      console.log('✅ expires_at column properly removed');
    }

    // Summary
    console.log('\n' + '=' . repeat(60));
    console.log('Summary:');
    console.log('=' . repeat(60));

    if (allGood) {
      console.log('✅ Schema is correct for Better Auth!');
      console.log('✅ OAuth should work without errors');
    } else {
      console.log('❌ Schema has issues - please fix before testing OAuth');
      console.log('\nTo fix, run:');
      console.log('  npx tsx scripts/fix-accounts-schema.ts');
      console.log('  npx tsx scripts/cleanup-old-expires-at.ts');
      process.exit(1);
    }

    console.log('\nAll columns in accounts table:');
    console.log('=' . repeat(60));
    columns.forEach((col: any) => {
      console.log(`  ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'nullable' : 'NOT NULL'}`);
    });

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n👋 Database connection closed');
  }
}

// Run verification
verifySchema();
