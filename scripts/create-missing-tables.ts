import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);

async function createMissingTables() {
  console.log('🔌 Connecting to database...');

  try {
    // Create conversations table
    console.log('📝 Creating conversations table...');
    await sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations(created_at);`;

    // Create memory_entries table with pgvector
    console.log('📝 Creating memory_entries table...');
    await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
    await sql`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        summary TEXT,
        metadata JSONB,
        embedding vector(1536),
        importance INTEGER DEFAULT 5,
        access_count INTEGER DEFAULT 0,
        last_accessed_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS memory_entries_user_id_idx ON memory_entries(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS memory_entries_conversation_id_idx ON memory_entries(conversation_id);`;
    await sql`CREATE INDEX IF NOT EXISTS memory_entries_created_at_idx ON memory_entries(created_at);`;
    await sql`CREATE INDEX IF NOT EXISTS memory_entries_importance_idx ON memory_entries(importance);`;

    // Create vector index (this might take time if there's data)
    console.log('📝 Creating vector similarity index...');
    await sql`
      CREATE INDEX IF NOT EXISTS memory_entries_embedding_idx
      ON memory_entries
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `;

    // Create proxy_authorizations table
    console.log('📝 Creating proxy_authorizations table...');
    await sql`
      CREATE TABLE IF NOT EXISTS proxy_authorizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action_class TEXT NOT NULL,
        action_type TEXT NOT NULL,
        scope TEXT NOT NULL,
        granted_at TIMESTAMP DEFAULT NOW() NOT NULL,
        expires_at TIMESTAMP,
        revoked_at TIMESTAMP,
        conditions JSONB,
        grant_method TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS proxy_authorizations_user_id_idx ON proxy_authorizations(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS proxy_authorizations_action_class_idx ON proxy_authorizations(action_class);`;
    await sql`CREATE INDEX IF NOT EXISTS proxy_authorizations_scope_idx ON proxy_authorizations(scope);`;
    await sql`CREATE INDEX IF NOT EXISTS proxy_authorizations_active_idx ON proxy_authorizations(user_id, action_class, revoked_at);`;

    // Create proxy_audit_log table
    console.log('📝 Creating proxy_audit_log table...');
    await sql`
      CREATE TABLE IF NOT EXISTS proxy_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        authorization_id UUID REFERENCES proxy_authorizations(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        action_class TEXT NOT NULL,
        mode TEXT NOT NULL,
        persona TEXT NOT NULL,
        input JSONB,
        output JSONB,
        model_used TEXT,
        confidence INTEGER,
        tokens_used INTEGER,
        latency_ms INTEGER,
        success BOOLEAN NOT NULL,
        error TEXT,
        user_confirmed BOOLEAN DEFAULT false,
        confirmed_at TIMESTAMP,
        timestamp TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS proxy_audit_log_user_id_idx ON proxy_audit_log(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS proxy_audit_log_action_idx ON proxy_audit_log(action);`;
    await sql`CREATE INDEX IF NOT EXISTS proxy_audit_log_timestamp_idx ON proxy_audit_log(timestamp);`;
    await sql`CREATE INDEX IF NOT EXISTS proxy_audit_log_success_idx ON proxy_audit_log(success);`;

    // Create user_authorization_preferences table
    console.log('📝 Creating user_authorization_preferences table...');
    await sql`
      CREATE TABLE IF NOT EXISTS user_authorization_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        template_id UUID NOT NULL REFERENCES authorization_templates(id) ON DELETE CASCADE,
        is_active BOOLEAN DEFAULT true,
        activated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        deactivated_at TIMESTAMP
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS user_auth_prefs_user_id_idx ON user_authorization_preferences(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS user_auth_prefs_template_id_idx ON user_authorization_preferences(template_id);`;
    await sql`CREATE INDEX IF NOT EXISTS user_auth_prefs_unique ON user_authorization_preferences(user_id, template_id);`;

    // Create consent_history table
    console.log('📝 Creating consent_history table...');
    await sql`
      CREATE TABLE IF NOT EXISTS consent_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        authorization_id UUID NOT NULL REFERENCES proxy_authorizations(id) ON DELETE CASCADE,
        change_type TEXT NOT NULL,
        previous_state JSONB,
        new_state JSONB,
        changed_by TEXT,
        reason TEXT,
        timestamp TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS consent_history_user_id_idx ON consent_history(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS consent_history_auth_id_idx ON consent_history(authorization_id);`;
    await sql`CREATE INDEX IF NOT EXISTS consent_history_timestamp_idx ON consent_history(timestamp);`;
    await sql`CREATE INDEX IF NOT EXISTS consent_history_change_type_idx ON consent_history(change_type);`;

    // Create proxy_rollbacks table
    console.log('📝 Creating proxy_rollbacks table...');
    await sql`
      CREATE TABLE IF NOT EXISTS proxy_rollbacks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        audit_entry_id UUID NOT NULL REFERENCES proxy_audit_log(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        strategy TEXT NOT NULL,
        status TEXT NOT NULL,
        rollback_data JSONB,
        error_message TEXT,
        completed_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS proxy_rollbacks_audit_entry_idx ON proxy_rollbacks(audit_entry_id);`;
    await sql`CREATE INDEX IF NOT EXISTS proxy_rollbacks_user_id_idx ON proxy_rollbacks(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS proxy_rollbacks_status_idx ON proxy_rollbacks(status);`;
    await sql`CREATE INDEX IF NOT EXISTS proxy_rollbacks_expires_at_idx ON proxy_rollbacks(expires_at);`;

    // Create update triggers
    console.log('📝 Creating update triggers...');
    await sql`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `;

    await sql`DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;`;
    await sql`
      CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;

    await sql`DROP TRIGGER IF EXISTS update_memory_entries_updated_at ON memory_entries;`;
    await sql`
      CREATE TRIGGER update_memory_entries_updated_at BEFORE UPDATE ON memory_entries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;

    await sql`DROP TRIGGER IF EXISTS update_proxy_authorizations_updated_at ON proxy_authorizations;`;
    await sql`
      CREATE TRIGGER update_proxy_authorizations_updated_at BEFORE UPDATE ON proxy_authorizations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;

    console.log('✅ All missing tables created successfully!');

    // Verify tables
    const tables = await sql`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    console.log('\n📊 Current database tables:');
    tables.forEach(t => console.log(`  ✓ ${t.tablename}`));

  } catch (error) {
    console.error('❌ Error creating tables:', error);
    process.exit(1);
  }
}

createMissingTables();
