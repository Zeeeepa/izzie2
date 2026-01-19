/**
 * Diagnose Entities Dashboard Issue
 *
 * Comprehensive test of:
 * 1. User authentication
 * 2. Weaviate collections
 * 3. Entity storage
 * 4. Entity retrieval by userId
 */

import { config } from 'dotenv';
import { getWeaviateClient, closeWeaviateClient } from '../src/lib/weaviate/client';
import { COLLECTIONS } from '../src/lib/weaviate/schema';
import { listEntitiesByType } from '../src/lib/weaviate/entities';
import type { EntityType } from '../src/lib/extraction/types';
import { dbClient } from '../src/lib/db';
import { users } from '../src/lib/db/schema';

// Load environment variables
config({ path: '.env.local' });

const VALID_TYPES: EntityType[] = [
  'person',
  'company',
  'project',
  'date',
  'topic',
  'location',
  'action_item',
];

async function main() {
  console.log('=== Diagnosing Entities Dashboard Issue ===\n');

  try {
    // Step 1: Check database users
    console.log('Step 1: Checking database users...');
    console.log('=' .repeat(60));

    const db = dbClient.getDb();
    const allUsers = await db.select().from(users);

    console.log(`Found ${allUsers.length} user(s) in database:`);
    allUsers.forEach((user, idx) => {
      console.log(`  ${idx + 1}. Email: ${user.email}`);
      console.log(`     Name: ${user.name}`);
      console.log(`     ID: ${user.id}`);
      console.log('');
    });

    if (allUsers.length === 0) {
      console.log('⚠️  No users found in database!');
      return;
    }

    const testUser = allUsers[0];
    console.log(`Using user: ${testUser.email} (ID: ${testUser.id})`);
    console.log('');

    // Step 2: Check Weaviate collections
    console.log('Step 2: Checking Weaviate collections...');
    console.log('=' .repeat(60));

    const client = await getWeaviateClient();
    const allCollections = await client.collections.listAll();

    console.log(`Found ${allCollections.length} collections in Weaviate:`);
    const entityCollectionNames = Object.values(COLLECTIONS);

    for (const collName of entityCollectionNames) {
      const exists = allCollections.some((c: any) => c.name === collName);
      console.log(`  ${exists ? '✓' : '✗'} ${collName}`);
    }
    console.log('');

    // Step 3: Check entities by userId
    console.log('Step 3: Checking entities for user...');
    console.log('=' .repeat(60));

    const entityCounts: Record<string, number> = {};
    let totalEntities = 0;

    for (const entityType of VALID_TYPES) {
      try {
        const entities = await listEntitiesByType(testUser.id, entityType, 100);
        entityCounts[entityType] = entities.length;
        totalEntities += entities.length;

        if (entities.length > 0) {
          console.log(`  ✓ ${entityType}: ${entities.length} entities`);
          console.log(`    Sample: "${entities[0].value}"`);
        } else {
          console.log(`  ✗ ${entityType}: 0 entities`);
        }
      } catch (error) {
        console.log(`  ✗ ${entityType}: ERROR - ${error instanceof Error ? error.message : String(error)}`);
        entityCounts[entityType] = 0;
      }
    }

    console.log('');
    console.log(`Total entities for user ${testUser.email}: ${totalEntities}`);
    console.log('');

    // Step 4: Sample entities to check userId field
    console.log('Step 4: Sampling entities to verify userId...');
    console.log('=' .repeat(60));

    const userIdsFound = new Set<string>();

    for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
      try {
        const collection = client.collections.get(collectionName);
        const result = await collection.query.fetchObjects({
          limit: 5,
          returnProperties: ['userId', 'value'],
        });

        result.objects.forEach((obj: any) => {
          userIdsFound.add(obj.properties.userId || 'NO_USER_ID');
        });
      } catch (error) {
        // Skip
      }
    }

    console.log(`Unique userIds in Weaviate: ${userIdsFound.size}`);
    Array.from(userIdsFound).forEach((uid, idx) => {
      const matches = uid === testUser.id ? '✓ MATCHES DB USER' : '✗ Different user';
      console.log(`  ${idx + 1}. "${uid}" ${matches}`);
    });
    console.log('');

    // Step 5: Diagnosis
    console.log('Step 5: Diagnosis');
    console.log('=' .repeat(60));

    if (totalEntities === 0) {
      console.log('⚠️  ISSUE FOUND: No entities found for authenticated user!');
      console.log('');
      console.log('Possible causes:');
      console.log('  1. Entities were stored with a different userId');
      console.log('  2. User authentication returns a different userId than expected');
      console.log('  3. Entities were not extracted/stored yet');
      console.log('');

      if (userIdsFound.size > 0) {
        const storedUserId = Array.from(userIdsFound)[0];
        if (storedUserId !== testUser.id) {
          console.log('✓ Found the issue:');
          console.log(`  - Database user ID: ${testUser.id}`);
          console.log(`  - Stored entity user ID: ${storedUserId}`);
          console.log('');
          console.log('Solutions:');
          console.log('  1. Re-extract entities with correct userId');
          console.log('  2. Update existing entities to use correct userId');
          console.log('  3. Verify authentication returns expected userId');
        }
      }
    } else {
      console.log('✓ Entities found successfully!');
      console.log(`  - User: ${testUser.email}`);
      console.log(`  - Total entities: ${totalEntities}`);
      console.log('');
      console.log('The entities API should work. If the dashboard shows 0 entities,');
      console.log('the issue is likely with authentication or API response handling.');
    }

  } catch (error) {
    console.error('Error during diagnosis:', error);
    if (error instanceof Error) {
      console.error('  Message:', error.message);
      console.error('  Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await closeWeaviateClient();
  }
}

main();
