/**
 * Create a test session for development/testing
 * This allows testing authenticated features without OAuth flow
 */

import { dbClient } from '../src/lib/db/index.js';
import { users, sessions } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';

async function createTestSession() {
  const db = dbClient.getDb();

  // Get the first user
  const [user] = await db.select().from(users).limit(1);

  if (!user) {
    console.error('No users found in database');
    process.exit(1);
  }

  console.log(`Creating test session for user: ${user.email}`);

  // Generate session ID and token
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const sessionToken = `test_session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Create session - expires in 7 days
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const [session] = await db
    .insert(sessions)
    .values({
      id: sessionId,
      userId: user.id,
      token: sessionToken,
      expiresAt,
      ipAddress: '127.0.0.1',
      userAgent: 'Test Script',
    })
    .returning();

  console.log('\n✅ Test session created successfully!');
  console.log('\nSession details:');
  console.log(`  User: ${user.email}`);
  console.log(`  Session Token: ${sessionToken}`);
  console.log(`  Expires: ${expiresAt.toISOString()}`);
  console.log('\nTo use this session in the browser:');
  console.log(`  1. Open DevTools > Application > Cookies`);
  console.log(`  2. Add cookie: izzie2.session_token = ${sessionToken}`);
  console.log(`  3. Refresh the page`);
  console.log('\nOr use this curl command to set the cookie:');
  console.log(
    `  curl -b "izzie2.session_token=${sessionToken}" http://localhost:3300/api/auth/get-session`
  );

  return { user, session, sessionToken };
}

createTestSession()
  .catch(console.error)
  .finally(() => process.exit(0));
