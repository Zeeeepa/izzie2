/**
 * Check which tables exist in the database
 */
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const result = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;

  console.log('Tables in production:');
  result.forEach((r: { table_name: string }) => console.log('  -', r.table_name));

  // Check if verifications table exists
  const hasVerifications = result.some((r: { table_name: string }) => r.table_name === 'verifications');
  console.log('\nverifications table exists:', hasVerifications);

  // Check migration history
  console.log('\nMigration history:');
  const migrations = await sql`SELECT * FROM __drizzle_migrations ORDER BY created_at`;
  migrations.forEach((m: { id: number; hash: string; created_at: number }) => {
    console.log('  -', m.hash);
  });
}

main().catch(console.error);
