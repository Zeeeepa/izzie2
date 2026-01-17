/**
 * Initialize Weaviate Schema
 *
 * Creates all entity collections in Weaviate Cloud.
 * Idempotent - safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/init-weaviate-schema.ts
 */

import { config } from 'dotenv';
import { initializeSchema } from '../src/lib/weaviate/schema';
import { isWeaviateReady, closeWeaviateClient } from '../src/lib/weaviate/client';

// Load environment variables
config({ path: '.env.local' });

async function main() {
  console.log('🚀 Initializing Weaviate schema...\n');

  try {
    // Check connection
    console.log('📡 Testing Weaviate connection...');
    const ready = await isWeaviateReady();

    if (!ready) {
      console.error('❌ Weaviate is not ready. Check your credentials.');
      process.exit(1);
    }

    console.log('✅ Weaviate connection successful\n');

    // Initialize schema
    console.log('📋 Creating collections...');
    await initializeSchema();

    console.log('\n✅ Schema initialization complete!');
    console.log('\nCreated collections:');
    console.log('  - Person');
    console.log('  - Company');
    console.log('  - Project');
    console.log('  - Date');
    console.log('  - Topic');
    console.log('  - Location');
    console.log('  - ActionItem');
  } catch (error) {
    console.error('\n❌ Schema initialization failed:', error);
    process.exit(1);
  } finally {
    await closeWeaviateClient();
  }
}

main();
