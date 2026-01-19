/**
 * Simple Database Check
 */

import { config } from 'dotenv';
import { dbClient } from '@/lib/db';

// Load environment
config({ path: '.env.local' });

async function checkDatabase() {
  console.log('🔍 Simple Database Check\n');

  try {
    // Get tables
    const tables = await dbClient.executeRaw<{ tablename: string }>(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log('Tables in database:');
    if (tables.length === 0) {
      console.log('  ⚠️  No tables found - migrations need to be run');
      console.log('\n  Run: npm run db:migrate');
    } else {
      tables.forEach((t) => {
        console.log(`  - ${t.tablename}`);
      });

      // Count rows in each table
      console.log('\nRow counts:');
      for (const table of tables) {
        try {
          const result = await dbClient.executeRaw<{ count: string }>(`
            SELECT COUNT(*) as count FROM "${table.tablename}"
          `);
          console.log(`  ${table.tablename}: ${result[0].count} rows`);
        } catch (error) {
          console.log(`  ${table.tablename}: error counting`);
        }
      }
    }

    // Check for pgvector extension
    const extensions = await dbClient.executeRaw<{ extname: string }>(`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `);

    console.log('\nExtensions:');
    if (extensions.length > 0) {
      console.log('  ✅ pgvector installed');
    } else {
      console.log('  ⚠️  pgvector not installed');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await dbClient.close();
    process.exit(0);
  }
}

checkDatabase();
