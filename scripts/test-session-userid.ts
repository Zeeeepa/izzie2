/**
 * Test what userId the session returns
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local explicitly
config({ path: resolve(process.cwd(), '.env.local') });

import { dbClient } from '../src/lib/db';
import { users, sessions } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

async function checkSessionUserId() {
  const db = dbClient.getDb();

  console.log('=== Checking User and Session Data ===\n');

  // Get all users
  const allUsers = await db.select().from(users);
  console.log(`Total users: ${allUsers.length}\n`);

  allUsers.forEach((user, idx) => {
    console.log(`User ${idx + 1}:`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.name}`);
    console.log('');
  });

  // Get all sessions
  const allSessions = await db.select().from(sessions);
  console.log(`Total sessions: ${allSessions.length}\n`);

  allSessions.forEach((session, idx) => {
    console.log(`Session ${idx + 1}:`);
    console.log(`  ID: ${session.id}`);
    console.log(`  User ID: ${session.userId}`);
    console.log(`  Expires: ${session.expiresAt}`);
    console.log('');
  });

  console.log('=== Analysis ===');
  console.log('The userId from the session should match one of the user IDs above.');
  console.log('Expected userId in Weaviate: tlHWmrogZXPR91lqdGO1fXM02j92rVDF');

  process.exit(0);
}

checkSessionUserId().catch(console.error);
