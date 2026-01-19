import { config } from 'dotenv';
import { dbClient } from './src/lib/db/client.ts';

// Load environment variables
config({ path: '.env.local' });

try {
  console.log('Checking memory_entries table...\n');

  const count = await dbClient.executeRaw('SELECT COUNT(*) as count FROM memory_entries');
  console.log(`Total entries: ${count[0].count}\n`);

  if (count[0].count > 0) {
    console.log('Sample entries:');
    const samples = await dbClient.executeRaw(
      'SELECT id, entity_type, entity_name, created_at FROM memory_entries ORDER BY created_at DESC LIMIT 10'
    );
    console.table(samples);
  }

  await dbClient.close();
} catch (error) {
  console.error('Error querying database:', error.message);
  process.exit(1);
}
