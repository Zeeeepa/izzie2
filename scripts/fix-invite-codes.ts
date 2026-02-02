/**
 * Fix invite_codes table in production
 *
 * This script:
 * 1. Connects to the production database (from .env.local)
 * 2. Checks if invite_codes table exists
 * 3. Creates it if missing
 * 4. Seeds initial codes if empty
 *
 * Usage: npx tsx scripts/fix-invite-codes.ts
 */

import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function fixInviteCodes() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  // Display connection info (masked for security)
  const urlParts = connectionString.match(/^postgresql:\/\/([^:]+):([^@]+)@([^/]+)\/(.+)$/);
  if (urlParts) {
    console.log(`Connecting to: ${urlParts[3]}/${urlParts[4].split('?')[0]}`);
    console.log(`User: ${urlParts[1]}`);
  }

  const pool = new Pool({ connectionString });

  try {
    // Step 1: Check if invite_codes table exists
    console.log('\n--- Step 1: Checking if invite_codes table exists ---');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'invite_codes'
      );
    `);

    const tableExists = tableCheck.rows[0].exists;
    console.log(`invite_codes table exists: ${tableExists}`);

    if (!tableExists) {
      // Step 2: Create the table
      console.log('\n--- Step 2: Creating invite_codes table ---');
      await pool.query(`
        CREATE TABLE invite_codes (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          code varchar(50) NOT NULL UNIQUE,
          created_by text REFERENCES users(id) ON DELETE SET NULL,
          used_by text REFERENCES users(id) ON DELETE SET NULL,
          used_at timestamp,
          expires_at timestamp,
          max_uses integer NOT NULL DEFAULT 1,
          use_count integer NOT NULL DEFAULT 0,
          created_at timestamp DEFAULT now() NOT NULL
        )
      `);
      console.log('Table created successfully');

      // Create indexes
      console.log('Creating indexes...');
      await pool.query('CREATE INDEX invite_codes_code_idx ON invite_codes(code)');
      await pool.query('CREATE INDEX invite_codes_created_by_idx ON invite_codes(created_by)');
      console.log('Indexes created successfully');
    }

    // Step 3: Check if codes exist
    console.log('\n--- Step 3: Checking existing codes ---');
    const codeCount = await pool.query('SELECT COUNT(*) as count FROM invite_codes');
    console.log(`Current invite codes count: ${codeCount.rows[0].count}`);

    // Step 4: Seed codes if empty
    if (codeCount.rows[0].count === '0') {
      console.log('\n--- Step 4: Seeding initial invite codes ---');
      await pool.query(`
        INSERT INTO invite_codes (id, code, max_uses, use_count, created_at)
        VALUES
          (gen_random_uuid()::text, 'IZZIE-FOUNDER', 999999, 0, now()),
          (gen_random_uuid()::text, 'IZZIE-BETA-001', 1, 0, now()),
          (gen_random_uuid()::text, 'IZZIE-BETA-002', 1, 0, now()),
          (gen_random_uuid()::text, 'IZZIE-BETA-003', 1, 0, now()),
          (gen_random_uuid()::text, 'IZZIE-BETA-004', 1, 0, now()),
          (gen_random_uuid()::text, 'IZZIE-BETA-005', 1, 0, now()),
          (gen_random_uuid()::text, 'IZZIE-BETA-006', 1, 0, now()),
          (gen_random_uuid()::text, 'IZZIE-BETA-007', 1, 0, now()),
          (gen_random_uuid()::text, 'IZZIE-BETA-008', 1, 0, now()),
          (gen_random_uuid()::text, 'IZZIE-BETA-009', 1, 0, now()),
          (gen_random_uuid()::text, 'IZZIE-BETA-010', 1, 0, now())
        ON CONFLICT (code) DO NOTHING
      `);
      console.log('Initial codes seeded successfully');
    }

    // Step 5: Verify
    console.log('\n--- Step 5: Verifying ---');
    const codes = await pool.query('SELECT code, max_uses, use_count FROM invite_codes ORDER BY code');
    console.log('Current invite codes:');
    console.table(codes.rows);

    console.log('\nDone! invite_codes table is ready.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixInviteCodes();
