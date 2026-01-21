import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL;
console.log('DB URL prefix:', dbUrl ? dbUrl.substring(0, 30) + '...' : 'NOT SET');
if (!dbUrl) process.exit(1);
const sql = neon(dbUrl);

async function check() {
  try {
    // Check if Better Auth tables exist
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'sessions', 'accounts', 'verifications')
      ORDER BY table_name
    `;
    console.log('Better Auth tables found:', tables.map(t => t.table_name));

    // Check users count
    const userCount = await sql`SELECT COUNT(*) as count FROM users`;
    console.log('Users count:', userCount[0].count);

    // Check sessions count
    const sessionCount = await sql`SELECT COUNT(*) as count FROM sessions`;
    console.log('Sessions count:', sessionCount[0].count);

    // Check accounts count
    const accountCount = await sql`SELECT COUNT(*) as count FROM accounts`;
    console.log('Accounts count:', accountCount[0].count);

    // Check verifications count
    const verificationCount = await sql`SELECT COUNT(*) as count FROM verifications`;
    console.log('Verifications count:', verificationCount[0].count);

    // Check accounts table structure
    const accountCols = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'accounts'
      ORDER BY ordinal_position
    `;
    console.log('Accounts columns:');
    accountCols.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));

    // Check users table structure
    const userCols = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `;
    console.log('\nUsers columns:');
    userCols.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));

  } catch (error) {
    console.error('Error:', error);
  }
}
check();
