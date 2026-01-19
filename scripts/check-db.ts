import { dbClient } from '../src/lib/db/client';
import { users, memoryEntries } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = dbClient.getDb();

  // Check if user exists
  console.log('Checking for user: bob@matsuoka.com...');
  const user = await db.select().from(users).where(eq(users.id, 'bob@matsuoka.com')).limit(1);
  console.log('User found:', user.length > 0 ? 'YES' : 'NO');
  if (user.length > 0) {
    console.log('User:', JSON.stringify(user[0], null, 2));
  } else {
    console.log('User NOT found. Available users:');
    const allUsers = await db.select().from(users).limit(5);
    console.log(JSON.stringify(allUsers, null, 2));
  }

  // Check memory entries count
  console.log('\nChecking memory entries...');
  const entries = await db.select().from(memoryEntries).limit(5);
  console.log('Memory entries count (showing max 5):', entries.length);
  if (entries.length > 0) {
    console.log('\nSample entries:');
    console.log(JSON.stringify(entries.map(e => ({
      id: e.id,
      userId: e.userId,
      summary: e.summary,
      createdAt: e.createdAt,
    })), null, 2));
  }
}

main().catch(console.error).finally(() => process.exit(0));
