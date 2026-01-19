/**
 * Check if users exist in the database
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { dbClient } from '../src/lib/db';
import { users } from '../src/lib/db/schema';

async function main() {
  const db = dbClient.getDb();

  const allUsers = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    emailVerified: users.emailVerified,
  }).from(users).limit(10);

  console.log('Users in database:', allUsers.length);
  allUsers.forEach(user => {
    console.log(`  - ${user.email} (${user.name}) [${user.id}]`);
  });

  process.exit(0);
}

main().catch(console.error);
