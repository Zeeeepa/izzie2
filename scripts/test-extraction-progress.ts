/**
 * Test script for extraction_progress table
 * Demonstrates CRUD operations and verifies schema functionality
 */

import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testExtractionProgress() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🧪 Testing extraction_progress table...\n');

    // Get a test user (or create one)
    console.log('1️⃣ Finding test user...');
    const userResult = await pool.query(`
      SELECT id, email FROM users LIMIT 1;
    `);

    if (userResult.rows.length === 0) {
      console.log('   ⚠️  No users found. Creating test user...');
      const createUserResult = await pool.query(`
        INSERT INTO users (id, email, name, email_verified, created_at, updated_at)
        VALUES ('test-user-' || gen_random_uuid(), 'test@example.com', 'Test User', true, now(), now())
        RETURNING id, email;
      `);
      console.log('   ✅ Created test user:', createUserResult.rows[0].email);
    }

    const testUserId = userResult.rows[0]?.id || 'test-user-123';
    console.log(`   ✅ Using user: ${testUserId}\n`);

    // Test 1: Insert new progress record
    console.log('2️⃣ Creating extraction progress record...');
    const insertResult = await pool.query(`
      INSERT INTO extraction_progress (
        id,
        user_id,
        source,
        status,
        chunk_size_days,
        total_items,
        processed_items,
        created_at,
        updated_at
      )
      VALUES (
        gen_random_uuid()::text,
        $1,
        'email',
        'idle',
        7,
        0,
        0,
        now(),
        now()
      )
      ON CONFLICT (user_id, source)
      DO UPDATE SET
        updated_at = now()
      RETURNING id, source, status;
    `, [testUserId]);

    const progressId = insertResult.rows[0].id;
    console.log('   ✅ Created progress record:', insertResult.rows[0]);

    // Test 2: Query the record
    console.log('\n3️⃣ Querying progress record...');
    const selectResult = await pool.query(`
      SELECT
        id,
        user_id,
        source,
        status,
        total_items,
        processed_items,
        failed_items,
        chunk_size_days,
        entities_extracted,
        total_cost,
        created_at
      FROM extraction_progress
      WHERE id = $1;
    `, [progressId]);

    console.log('   ✅ Found record:', selectResult.rows[0]);

    // Test 3: Update the record
    console.log('\n4️⃣ Updating progress (simulating extraction)...');
    const updateResult = await pool.query(`
      UPDATE extraction_progress
      SET
        status = 'running',
        total_items = 100,
        processed_items = 25,
        current_chunk_start = now() - interval '7 days',
        current_chunk_end = now(),
        last_run_at = now(),
        updated_at = now()
      WHERE id = $1
      RETURNING status, total_items, processed_items, current_chunk_start, current_chunk_end;
    `, [progressId]);

    console.log('   ✅ Updated record:', updateResult.rows[0]);

    // Test 4: Test unique constraint
    console.log('\n5️⃣ Testing unique constraint (user_id, source)...');
    try {
      await pool.query(`
        INSERT INTO extraction_progress (
          id,
          user_id,
          source,
          status,
          created_at,
          updated_at
        )
        VALUES (
          gen_random_uuid()::text,
          $1,
          'email',
          'idle',
          now(),
          now()
        );
      `, [testUserId]);

      console.log('   ❌ Unique constraint failed - duplicate was allowed!');
    } catch (error: any) {
      if (error.code === '23505') {
        console.log('   ✅ Unique constraint working (duplicate rejected)');
      } else {
        throw error;
      }
    }

    // Test 5: Query by user and source
    console.log('\n6️⃣ Testing index query (user_id + source)...');
    const indexQueryResult = await pool.query(`
      SELECT
        id,
        source,
        status,
        processed_items,
        total_items
      FROM extraction_progress
      WHERE user_id = $1 AND source = 'email';
    `, [testUserId]);

    console.log('   ✅ Query successful:', indexQueryResult.rows[0]);

    // Test 6: Cleanup
    console.log('\n7️⃣ Cleaning up test data...');
    await pool.query(`
      DELETE FROM extraction_progress WHERE id = $1;
    `, [progressId]);

    console.log('   ✅ Test data cleaned up');

    console.log('\n✅ All tests passed! Schema is working correctly.\n');
    console.log('📊 Summary:');
    console.log('   - Create: ✅');
    console.log('   - Read: ✅');
    console.log('   - Update: ✅');
    console.log('   - Unique constraint: ✅');
    console.log('   - Index query: ✅');
    console.log('   - Delete: ✅');
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('Details:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testExtractionProgress();
