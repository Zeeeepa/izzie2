/**
 * Direct Extraction Test Script
 *
 * This script:
 * 1. Queries the database for an authenticated user
 * 2. Checks if they have Google OAuth tokens
 * 3. Shows their extraction progress
 * 4. Shows recently extracted entities
 */

import { config } from 'dotenv';
import { dbClient } from './src/lib/db/client.ts';

// Load environment variables
config({ path: '.env.local' });

async function checkExtraction() {
  console.log('🔍 Checking extraction status...\n');

  try {
    // 1. Check for users
    console.log('👤 Users in database:');
    const users = await dbClient.executeRaw(`
      SELECT id, email, name, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (users.length === 0) {
      console.log('❌ No users found. Please sign in at http://localhost:3300 first.');
      await dbClient.close();
      return;
    }

    for (const user of users) {
      console.log(`  - ${user.email} (ID: ${user.id})`);
    }
    console.log('');

    const userId = users[0].id;
    const userEmail = users[0].email;

    // 2. Check for Google OAuth tokens
    console.log('🔑 OAuth tokens:');
    const accounts = await dbClient.executeRaw(`
      SELECT
        provider_id,
        access_token IS NOT NULL as has_access,
        refresh_token IS NOT NULL as has_refresh,
        access_token_expires_at
      FROM accounts
      WHERE user_id = $1
    `, [userId]);

    if (accounts.length === 0) {
      console.log('❌ No OAuth accounts linked.');
      console.log('💡 Sign in with Google at http://localhost:3300');
      await dbClient.close();
      return;
    }

    for (const account of accounts) {
      console.log(`  ${account.provider_id}: access=${account.has_access}, refresh=${account.has_refresh}`);
      if (account.access_token_expires_at) {
        const expiresAt = new Date(account.access_token_expires_at);
        const isExpired = expiresAt < new Date();
        console.log(`    Expires: ${expiresAt.toISOString()} ${isExpired ? '(EXPIRED)' : '(valid)'}`);
      }
    }
    console.log('');

    // 3. Check extraction progress
    console.log('📊 Extraction Progress:');
    const progress = await dbClient.executeRaw(`
      SELECT
        source,
        status,
        total_items,
        processed_items,
        failed_items,
        entities_extracted,
        updated_at
      FROM extraction_progress
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `, [userId]);

    if (progress.length === 0) {
      console.log('  No extraction runs yet.');
    } else {
      for (const row of progress) {
        console.log(`  ${row.source}: ${row.status}`);
        console.log(`    Processed: ${row.processed_items}/${row.total_items}`);
        console.log(`    Entities: ${row.entities_extracted}`);
        console.log(`    Failed: ${row.failed_items}`);
        console.log(`    Updated: ${new Date(row.updated_at).toLocaleString()}`);
      }
    }
    console.log('');

    // 4. Check extracted entities
    console.log('🧩 Recently Extracted Entities:');
    const entities = await dbClient.executeRaw(`
      SELECT
        id,
        type,
        name,
        properties,
        created_at
      FROM entities
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (entities.length === 0) {
      console.log('  No entities found yet.');
      console.log('');
      console.log('💡 To trigger extraction:');
      console.log('  1. Open http://localhost:3300 in browser');
      console.log('  2. Sign in with Google');
      console.log('  3. Open browser console');
      console.log('  4. Paste trigger-sync.js and run: triggerSync({ maxResults: 10 })');
    } else {
      console.log(`  Found ${entities.length} entities:`);
      for (const entity of entities) {
        console.log(`  - ${entity.type}: ${entity.name}`);
        console.log(`    ID: ${entity.id}`);
        console.log(`    Created: ${new Date(entity.created_at).toLocaleString()}`);
        if (entity.properties && Object.keys(entity.properties).length > 0) {
          console.log(`    Properties: ${JSON.stringify(entity.properties).slice(0, 100)}...`);
        }
      }
    }
    console.log('');

    // 5. Show API usage
    console.log('📡 API Endpoint:');
    console.log(`  POST http://localhost:3300/api/gmail/sync-user`);
    console.log(`  Requires: Browser session cookie (authenticated)`);
    console.log('');
    console.log('  Body: {');
    console.log('    "folder": "sent",    // "inbox", "sent", or "all"');
    console.log('    "maxResults": 10,    // Number of emails to process');
    console.log('    "since": "2024-01-01" // Optional');
    console.log('  }');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Database is not running. Start it with:');
      console.log('   docker-compose up -d postgres');
    } else if (error.code === '42P01') {
      console.log('💡 Tables not created. Run migrations:');
      console.log('   pnpm drizzle-kit push');
    }
  } finally {
    await dbClient.close();
  }
}

checkExtraction();
