/**
 * Test entities API to debug userId filtering issue
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local explicitly
config({ path: resolve(process.cwd(), '.env.local') });

import { listEntitiesByType } from '../src/lib/weaviate/entities';

async function testEntitiesAPI() {
  // Test user ID for development - not a secret  pragma: allowlist secret
  const userId = 'tlHWmrogZXPR91lqdGO1fXM02j92rVDF';

  console.log('=== Testing listEntitiesByType Function ===\n');
  console.log(`Using userId: ${userId}\n`);

  const types = ['person', 'company', 'action_item'] as const;

  for (const type of types) {
    console.log(`\n--- Testing ${type} entities ---`);
    try {
      const entities = await listEntitiesByType(userId, type, 10);
      console.log(`✅ Found ${entities.length} ${type} entities`);

      if (entities.length > 0) {
        console.log('\nFirst entity:');
        console.log(`  Value: ${entities[0].value}`);
        console.log(`  Normalized: ${entities[0].normalized}`);
        console.log(`  Source: ${entities[0].source}`);
        console.log(`  SourceId: ${entities[0].sourceId}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching ${type} entities:`, error);
    }
  }

  console.log('\n=== Summary ===');
  console.log('If entities are returned above, the API should work correctly.');
  console.log('If no entities are returned, the issue is in listEntitiesByType filtering.');
}

testEntitiesAPI().catch(console.error);
