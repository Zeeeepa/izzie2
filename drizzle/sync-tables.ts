/**
 * Database Table Sync Script
 *
 * This script ensures all required tables exist in the database.
 * It's designed to work with Better Auth's text-based user IDs.
 *
 * Usage: npm run db:sync
 *
 * This is useful when:
 * - The database was created by Better Auth and needs izzie2 tables
 * - Running against a database that may be missing some tables
 * - Initial setup on a new environment
 */

import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function syncTables() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');
  const pool = new Pool({ connectionString });

  try {
    // Step 1: Enable pgvector extension
    console.log('📦 Enabling pgvector extension...');
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Step 2: Create conversations table
    console.log('📝 Creating conversations table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title text,
        metadata jsonb,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations(created_at)');

    // Step 3: Create memory_entries table
    console.log('📝 Creating memory_entries table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content text NOT NULL,
        summary text,
        metadata jsonb,
        embedding vector(1536),
        importance integer DEFAULT 5,
        access_count integer DEFAULT 0,
        last_accessed_at timestamp,
        is_deleted boolean DEFAULT false,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS memory_entries_user_id_idx ON memory_entries(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS memory_entries_conversation_id_idx ON memory_entries(conversation_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS memory_entries_created_at_idx ON memory_entries(created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS memory_entries_importance_idx ON memory_entries(importance)');

    // Step 4: Create extraction_progress table
    console.log('📝 Creating extraction_progress table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS extraction_progress (
        id text PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source text NOT NULL,
        status text DEFAULT 'idle' NOT NULL,
        oldest_date_extracted timestamp,
        newest_date_extracted timestamp,
        total_items integer DEFAULT 0,
        processed_items integer DEFAULT 0,
        failed_items integer DEFAULT 0,
        chunk_size_days integer DEFAULT 7,
        current_chunk_start timestamp,
        current_chunk_end timestamp,
        entities_extracted integer DEFAULT 0,
        total_cost integer DEFAULT 0,
        last_run_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS extraction_progress_user_id_idx ON extraction_progress(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS extraction_progress_source_idx ON extraction_progress(source)');
    await pool.query('CREATE INDEX IF NOT EXISTS extraction_progress_status_idx ON extraction_progress(status)');
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS extraction_progress_user_source_unique ON extraction_progress(user_id, source)');

    // Step 5: Create chat_sessions table
    console.log('📝 Creating chat_sessions table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title text,
        current_task jsonb,
        compressed_history text,
        recent_messages jsonb DEFAULT '[]'::jsonb NOT NULL,
        archived_messages jsonb,
        message_count integer DEFAULT 0 NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS chat_sessions_user_id_idx ON chat_sessions(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS chat_sessions_created_at_idx ON chat_sessions(created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS chat_sessions_updated_at_idx ON chat_sessions(updated_at)');

    // Step 6: Create telegram tables
    console.log('📝 Creating telegram tables...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        telegram_chat_id bigint NOT NULL UNIQUE,
        telegram_username text,
        linked_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS telegram_links_user_id_idx ON telegram_links(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS telegram_links_telegram_chat_id_idx ON telegram_links(telegram_chat_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_link_codes (
        code varchar(6) PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamp NOT NULL,
        used boolean DEFAULT false NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS telegram_link_codes_user_id_idx ON telegram_link_codes(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS telegram_link_codes_expires_at_idx ON telegram_link_codes(expires_at)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        telegram_chat_id bigint NOT NULL UNIQUE,
        chat_session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS telegram_sessions_telegram_chat_id_idx ON telegram_sessions(telegram_chat_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS telegram_sessions_chat_session_id_idx ON telegram_sessions(chat_session_id)');

    // Step 7: Create digest tables
    console.log('📝 Creating digest tables...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS digest_preferences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        enabled boolean DEFAULT true NOT NULL,
        morning_time text DEFAULT '08:00:00' NOT NULL,
        evening_time text DEFAULT '18:00:00' NOT NULL,
        timezone text DEFAULT 'UTC' NOT NULL,
        channels text[] DEFAULT ARRAY['email']::text[] NOT NULL,
        min_relevance_score text DEFAULT '0.50' NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS digest_preferences_user_id_idx ON digest_preferences(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS digest_preferences_enabled_idx ON digest_preferences(enabled)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS digest_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        digest_type text NOT NULL,
        generated_at timestamp DEFAULT now() NOT NULL,
        delivered_at timestamp,
        delivery_channel text NOT NULL,
        item_count integer DEFAULT 0 NOT NULL,
        content jsonb,
        error text
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS digest_records_user_id_idx ON digest_records(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS digest_records_digest_type_idx ON digest_records(digest_type)');
    await pool.query('CREATE INDEX IF NOT EXISTS digest_records_generated_at_idx ON digest_records(generated_at)');

    // Step 8: Create proxy authorization tables
    console.log('📝 Creating proxy authorization tables...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proxy_authorizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action_class text NOT NULL,
        action_type text NOT NULL,
        scope text NOT NULL,
        granted_at timestamp DEFAULT now() NOT NULL,
        expires_at timestamp,
        revoked_at timestamp,
        conditions jsonb,
        grant_method text NOT NULL,
        metadata jsonb,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS proxy_authorizations_user_id_idx ON proxy_authorizations(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS proxy_authorizations_action_class_idx ON proxy_authorizations(action_class)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS proxy_audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        authorization_id uuid REFERENCES proxy_authorizations(id) ON DELETE SET NULL,
        action text NOT NULL,
        action_class text NOT NULL,
        mode text NOT NULL,
        persona text NOT NULL,
        input jsonb,
        output jsonb,
        model_used text,
        confidence integer,
        tokens_used integer,
        latency_ms integer,
        success boolean NOT NULL,
        error text,
        user_confirmed boolean DEFAULT false,
        confirmed_at timestamp,
        timestamp timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS proxy_audit_log_user_id_idx ON proxy_audit_log(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS proxy_audit_log_action_idx ON proxy_audit_log(action)');
    await pool.query('CREATE INDEX IF NOT EXISTS proxy_audit_log_timestamp_idx ON proxy_audit_log(timestamp)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS authorization_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        description text,
        authorizations jsonb,
        is_default boolean DEFAULT false,
        is_active boolean DEFAULT true,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_authorization_preferences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        template_id uuid NOT NULL REFERENCES authorization_templates(id) ON DELETE CASCADE,
        is_active boolean DEFAULT true,
        activated_at timestamp DEFAULT now() NOT NULL,
        deactivated_at timestamp
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS user_auth_prefs_user_id_idx ON user_authorization_preferences(user_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS consent_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        authorization_id uuid NOT NULL REFERENCES proxy_authorizations(id) ON DELETE CASCADE,
        change_type text NOT NULL,
        previous_state jsonb,
        new_state jsonb,
        changed_by text,
        reason text,
        timestamp timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS consent_history_user_id_idx ON consent_history(user_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS proxy_rollbacks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        audit_entry_id uuid NOT NULL REFERENCES proxy_audit_log(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        strategy text NOT NULL,
        status text NOT NULL,
        rollback_data jsonb,
        error_message text,
        completed_at timestamp,
        expires_at timestamp NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS proxy_rollbacks_user_id_idx ON proxy_rollbacks(user_id)');

    // Step 9: Create MCP tables
    console.log('📝 Creating MCP tables...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text,
        transport text NOT NULL,
        command text,
        args jsonb,
        env jsonb,
        url text,
        headers jsonb,
        enabled boolean DEFAULT true NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS mcp_servers_user_id_idx ON mcp_servers(user_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mcp_tool_permissions (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        server_id text NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
        tool_name text NOT NULL,
        always_allow boolean DEFAULT false NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS mcp_tool_permissions_user_id_idx ON mcp_tool_permissions(user_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mcp_tool_audit_log (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        server_id text NOT NULL,
        tool_name text NOT NULL,
        arguments jsonb,
        result jsonb,
        error text,
        duration integer,
        created_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS mcp_tool_audit_log_user_id_idx ON mcp_tool_audit_log(user_id)');

    // Step 10: Create agent framework tables
    console.log('📝 Creating agent framework tables...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        agent_type text NOT NULL,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id text,
        status text DEFAULT 'pending' NOT NULL,
        input jsonb NOT NULL,
        output jsonb,
        error text,
        progress integer DEFAULT 0 NOT NULL,
        current_step text,
        steps_completed integer DEFAULT 0 NOT NULL,
        total_steps integer DEFAULT 0 NOT NULL,
        tokens_used integer DEFAULT 0 NOT NULL,
        total_cost integer DEFAULT 0 NOT NULL,
        budget_limit integer,
        parent_task_id text,
        created_at timestamp DEFAULT now() NOT NULL,
        started_at timestamp,
        completed_at timestamp,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);
    // Add self-referential FK only if not exists
    await pool.query(
      'ALTER TABLE agent_tasks ADD CONSTRAINT agent_tasks_parent_fk FOREIGN KEY (parent_task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE'
    ).catch(() => {
      /* constraint may already exist */
    });
    await pool.query('CREATE INDEX IF NOT EXISTS agent_tasks_user_id_idx ON agent_tasks(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS agent_tasks_status_idx ON agent_tasks(status)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS research_sources (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        task_id text NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
        url text NOT NULL,
        title text,
        content text,
        content_type text,
        relevance_score integer,
        credibility_score integer,
        fetch_status text DEFAULT 'pending' NOT NULL,
        fetch_error text,
        fetched_at timestamp,
        expires_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS research_sources_task_id_idx ON research_sources(task_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS research_findings (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        task_id text NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
        source_id text REFERENCES research_sources(id) ON DELETE SET NULL,
        claim text NOT NULL,
        evidence text,
        confidence integer NOT NULL,
        citation text,
        quote text,
        embedding vector(1536),
        created_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS research_findings_task_id_idx ON research_findings(task_id)');

    console.log('✅ All tables synced successfully!');

    // Verify
    const expectedTables = [
      'extraction_progress',
      'chat_sessions',
      'conversations',
      'memory_entries',
      'telegram_links',
      'telegram_link_codes',
      'telegram_sessions',
      'digest_preferences',
      'digest_records',
      'proxy_authorizations',
      'proxy_audit_log',
      'authorization_templates',
      'user_authorization_preferences',
      'consent_history',
      'proxy_rollbacks',
      'mcp_servers',
      'mcp_tool_permissions',
      'mcp_tool_audit_log',
      'agent_tasks',
      'research_sources',
      'research_findings',
    ];

    const tables = await pool.query(
      `
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename = ANY($1)
      ORDER BY tablename
    `,
      [expectedTables]
    );

    console.log(`\n📊 Table status: ${tables.rows.length}/${expectedTables.length} tables exist`);

    const missing = expectedTables.filter((t) => !tables.rows.some((r: { tablename: string }) => r.tablename === t));
    if (missing.length > 0) {
      console.log('⚠️  Missing tables:', missing.join(', '));
    }
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('👋 Database connection closed');
  }
}

// Run sync
syncTables();
