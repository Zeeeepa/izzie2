import { dbClient } from '../src/lib/db';
import { users } from '../src/lib/db/schema';

async function main() {
  const db = dbClient.getDb();
  const allUsers = await db.select({ email: users.email, id: users.id, name: users.name }).from(users).limit(5);

  console.log('Users in database:');
  allUsers.forEach((u) => console.log(`  - ${u.email} (${u.id})${u.name ? ' - ' + u.name : ''}`));

  if (allUsers.length === 0) {
    console.log('  (no users found)');
  }

  process.exit(0);
}

main();
