import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env.local' });

async function listTables() {
  const sql = neon(process.env.DATABASE_URL!);
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  console.log('📋 Tables in database:');
  tables.forEach(t => console.log('  -', t.table_name));

  // Check if chat_sessions exists
  const hasChatSessions = tables.some(t => t.table_name === 'chat_sessions');
  console.log('\n' + (hasChatSessions ? '✅ chat_sessions table exists' : '❌ chat_sessions table NOT found'));
}

listTables().catch(console.error);
