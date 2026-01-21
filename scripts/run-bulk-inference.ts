/**
 * Run Bulk Relationship Inference
 *
 * Creates an authenticated session and calls the bulk inference API
 *
 * Run with: npx tsx scripts/run-bulk-inference.ts
 */

import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(process.cwd(), '.env.local') });

import { dbClient } from '../src/lib/db/index.js';
import { users, sessions } from '../src/lib/db/schema.js';

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300';

/**
 * Create a test session and return the token
 */
async function createTestSession(): Promise<{ userId: string; token: string }> {
  const db = dbClient.getDb();

  // Get the first user
  const [user] = await db.select().from(users).limit(1);

  if (!user) {
    throw new Error('No users found in database. Please create a user first.');
  }

  // Generate session token
  const sessionId = `session_bulk_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const sessionToken = `bulk_session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Create session - expires in 1 hour
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    token: sessionToken,
    expiresAt,
    ipAddress: '127.0.0.1',
    userAgent: 'Bulk Inference Script',
  });

  console.log(`Created session for user: ${user.email} (${user.id})`);

  return { userId: user.id, token: sessionToken };
}

/**
 * Call bulk inference API
 */
async function runBulkInference(token: string): Promise<void> {
  console.log('\n--- Calling Bulk Inference API ---\n');

  const startTime = Date.now();

  const response = await fetch(`${API_BASE}/api/relationships/bulk-infer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `izzie2.session_token=${token}`,
    },
    body: JSON.stringify({
      limit: 200,  // Process up to 200 entities per type
      entityTypes: ['person', 'company', 'project', 'topic', 'event'],
    }),
  });

  const elapsed = Date.now() - startTime;
  const data = await response.json();

  console.log(`Response Status: ${response.status}`);
  console.log(`Processing Time: ${elapsed}ms (API), ${data.processingTime || 'N/A'}ms (server)`);
  console.log('\n--- Results ---\n');
  console.log(JSON.stringify(data, null, 2));

  if (data.success) {
    console.log('\n--- Summary ---');
    console.log(`Total Relationships Inferred: ${data.totalRelationships}`);
    console.log(`Sources Processed: ${data.sourcesProcessed} / ${data.totalSources}`);
    console.log(`Entities Processed: ${data.entitiesProcessed}`);
    console.log(`Estimated Cost: $${data.totalCost || 0}`);

    if (data.errors && data.errors.length > 0) {
      console.log('\nErrors encountered:');
      data.errors.forEach((err: string) => console.log(`  - ${err}`));
    }
  } else {
    console.log('\nInference failed:', data.error || data.details || 'Unknown error');
  }
}

/**
 * Main runner
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Bulk Relationship Inference Runner');
  console.log('='.repeat(60));
  console.log(`\nAPI Base: ${API_BASE}`);

  try {
    // Create session
    console.log('\n--- Creating Session ---');
    const { userId, token } = await createTestSession();
    console.log(`User ID: ${userId}`);

    // Run bulk inference
    await runBulkInference(token);

  } catch (error) {
    console.error('\nFATAL ERROR:', error);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
