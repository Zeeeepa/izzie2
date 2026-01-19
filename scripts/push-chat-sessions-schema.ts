/**
 * Push chat_sessions table to database
 * Direct SQL execution to bypass interactive prompts
 */

import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const SQL = `
-- Create chat_sessions table for POC-6
CREATE TABLE IF NOT EXISTS "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"current_task" jsonb,
	"compressed_history" text,
	"recent_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived_messages" jsonb,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chat_sessions_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "chat_sessions_user_id_idx" ON "chat_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "chat_sessions_created_at_idx" ON "chat_sessions" ("created_at");
CREATE INDEX IF NOT EXISTS "chat_sessions_updated_at_idx" ON "chat_sessions" ("updated_at");

-- Add trigger for automatic updated_at updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_chat_sessions_updated_at'
  ) THEN
    CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
`;

async function pushSchema() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL not found');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');
  const pool = new Pool({ connectionString });

  try {
    console.log('🚀 Creating chat_sessions table...');
    await pool.query(SQL);
    console.log('✅ chat_sessions table created successfully');
  } catch (error) {
    console.error('❌ Failed to create table:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('👋 Connection closed');
  }
}

pushSchema();
