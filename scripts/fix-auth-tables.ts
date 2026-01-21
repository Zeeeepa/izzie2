import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('No DATABASE_URL');
  process.exit(1);
}

const sql = neon(dbUrl);

async function fixAuthTables() {
  try {
    console.log('Checking current verifications table structure...');
    const cols = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'verifications'
      ORDER BY ordinal_position
    `;
    console.log('Current verifications columns:');
    cols.forEach((c) => console.log(`  - ${c.column_name}: ${c.data_type}`));

    // Check if users table exists
    const userTable = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      ) as exists
    `;
    console.log('\nUsers table exists:', userTable[0].exists);

    // Check if sessions table exists
    const sessionTable = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sessions'
      ) as exists
    `;
    console.log('Sessions table exists:', sessionTable[0].exists);

    // Check if accounts table exists
    const accountTable = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'accounts'
      ) as exists
    `;
    console.log('Accounts table exists:', accountTable[0].exists);

    // If user confirmed, create missing tables
    const args = process.argv.slice(2);
    if (args.includes('--fix')) {
      console.log('\n--- CREATING MISSING BETTER AUTH TABLES ---\n');

      // First create users table (required by sessions and accounts)
      console.log('Creating users table...');
      await sql`
        CREATE TABLE IF NOT EXISTS "users" (
          "id" text PRIMARY KEY,
          "email" varchar(255) NOT NULL UNIQUE,
          "email_verified" boolean DEFAULT false NOT NULL,
          "name" text,
          "image" text,
          "metadata" jsonb DEFAULT '{}'::jsonb,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        )
      `;
      console.log('  ✓ Users table created');

      // Create index on email
      await sql`CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email")`;
      console.log('  ✓ Users email index created');

      // Create sessions table
      console.log('Creating sessions table...');
      await sql`
        CREATE TABLE IF NOT EXISTS "sessions" (
          "id" text PRIMARY KEY,
          "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "expires_at" timestamp NOT NULL,
          "token" text NOT NULL UNIQUE,
          "ip_address" text,
          "user_agent" text,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        )
      `;
      console.log('  ✓ Sessions table created');

      // Create sessions indexes
      await sql`CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id")`;
      await sql`CREATE INDEX IF NOT EXISTS "sessions_token_idx" ON "sessions" ("token")`;
      await sql`CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" ("expires_at")`;
      console.log('  ✓ Sessions indexes created');

      // Create accounts table
      console.log('Creating accounts table...');
      await sql`
        CREATE TABLE IF NOT EXISTS "accounts" (
          "id" text PRIMARY KEY,
          "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "account_id" text NOT NULL,
          "provider_id" text NOT NULL,
          "access_token" text,
          "refresh_token" text,
          "id_token" text,
          "access_token_expires_at" timestamp,
          "refresh_token_expires_at" timestamp,
          "scope" text,
          "password" text,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        )
      `;
      console.log('  ✓ Accounts table created');

      // Create accounts indexes
      await sql`CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" ("user_id")`;
      await sql`CREATE INDEX IF NOT EXISTS "accounts_provider_idx" ON "accounts" ("provider_id", "account_id")`;
      console.log('  ✓ Accounts indexes created');

      // Drop and recreate verifications table with correct schema
      console.log('Recreating verifications table with correct schema...');
      await sql`DROP TABLE IF EXISTS "verifications" CASCADE`;
      await sql`
        CREATE TABLE "verifications" (
          "id" text PRIMARY KEY,
          "identifier" text NOT NULL,
          "value" text NOT NULL,
          "expires_at" timestamp NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications" ("identifier")`;
      console.log('  ✓ Verifications table recreated');

      console.log('\n✓ All Better Auth tables created successfully!');

      // Verify
      console.log('\nVerifying tables...');
      const tables = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('users', 'sessions', 'accounts', 'verifications')
        ORDER BY table_name
      `;
      console.log('Better Auth tables now present:', tables.map((t) => t.table_name));
    } else {
      console.log('\n\nTo fix the database, run with --fix flag:');
      console.log('  npx tsx scripts/fix-auth-tables.ts --fix');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixAuthTables();
