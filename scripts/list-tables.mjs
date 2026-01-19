import { config } from 'dotenv';
import { dbClient } from './src/lib/db/client.ts';

config({ path: '.env.local' });

try {
  console.log('📊 Database Tables:\n');

  const tables = await dbClient.executeRaw(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);

  for (const table of tables) {
    console.log(`  - ${table.tablename}`);
  }

  console.log(`\nTotal: ${tables.length} tables\n`);

  await dbClient.close();
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
