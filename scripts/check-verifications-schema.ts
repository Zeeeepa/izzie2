/**
 * Check verifications table schema
 */
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  // Check table structure
  const columns = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'verifications'
    ORDER BY ordinal_position
  `;

  console.log('verifications table structure:');
  columns.forEach((c: { column_name: string; data_type: string; is_nullable: string; column_default: string | null }) => {
    console.log(`  - ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable}, default: ${c.column_default})`);
  });

  // Try a test insert similar to what Better Auth does
  console.log('\nTrying test insert...');
  try {
    const testResult = await sql`
      INSERT INTO "verifications" ("id", "identifier", "value", "expires_at", "created_at", "updated_at")
      VALUES ('test-id', 'test-identifier', '{"test":"value"}', NOW() + INTERVAL '10 minutes', NOW(), NOW())
      RETURNING *
    `;
    console.log('Insert succeeded:', testResult);

    // Clean up test data
    await sql`DELETE FROM "verifications" WHERE id = 'test-id'`;
    console.log('Test data cleaned up');
  } catch (error) {
    console.error('Insert failed:', error);
  }
}

main().catch(console.error);
