/**
 * Migrate Weaviate Entity User IDs
 *
 * Updates userId field from old Auth0 ID to new Auth0 ID for all entities and relationships.
 *
 * Old userId: tlHWmrogZXPR91lqdGO1fXM02j92rVDF
 * New userId: W1SkmfubAgAw1WzkmebBPJDouzuFoaCV (bob@matsuoka.com)
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local explicitly for Weaviate credentials
config({ path: resolve(process.cwd(), '.env.local') });

import { getWeaviateClient, closeWeaviateClient } from '../src/lib/weaviate/client';
import { COLLECTIONS, RELATIONSHIP_COLLECTION } from '../src/lib/weaviate/schema';

const OLD_USER_ID = 'tlHWmrogZXPR91lqdGO1fXM02j92rVDF';
const NEW_USER_ID = 'W1SkmfubAgAw1WzkmebBPJDouzuFoaCV';

interface MigrationResult {
  collection: string;
  found: number;
  updated: number;
  errors: number;
}

async function migrateCollection(
  client: Awaited<ReturnType<typeof getWeaviateClient>>,
  collectionName: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    collection: collectionName,
    found: 0,
    updated: 0,
    errors: 0,
  };

  console.log(`\n--- Migrating ${collectionName} ---`);

  try {
    const collection = client.collections.get(collectionName);

    // Fetch all entities with the old userId
    // Use filter to get only entities with old userId
    const queryResult = await collection.query.fetchObjects({
      filters: collection.filter.byProperty('userId').equal(OLD_USER_ID),
      limit: 10000,
      returnProperties: ['userId', 'value'],
    });

    result.found = queryResult.objects.length;
    console.log(`Found ${result.found} entities with old userId`);

    if (result.found === 0) {
      console.log('No entities to migrate');
      return result;
    }

    // Update each entity
    for (const obj of queryResult.objects) {
      try {
        // Weaviate v3 client uses update method
        await collection.data.update({
          id: obj.uuid,
          properties: {
            userId: NEW_USER_ID,
          },
        });
        result.updated++;

        // Log progress every 100 entities
        if (result.updated % 100 === 0) {
          console.log(`  Updated ${result.updated}/${result.found} entities...`);
        }
      } catch (error) {
        result.errors++;
        console.error(`  Error updating entity ${obj.uuid}:`, error);
      }
    }

    console.log(`Completed: ${result.updated} updated, ${result.errors} errors`);
  } catch (error) {
    console.error(`Error migrating ${collectionName}:`, error);
  }

  return result;
}

async function migrate() {
  console.log('=== Weaviate User ID Migration ===\n');
  console.log(`Old userId: ${OLD_USER_ID}`);
  console.log(`New userId: ${NEW_USER_ID}`);

  try {
    console.log('\nConnecting to Weaviate...');
    const client = await getWeaviateClient();

    const results: MigrationResult[] = [];

    // Migrate entity collections
    for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
      const result = await migrateCollection(client, collectionName);
      results.push(result);
    }

    // Migrate Relationship collection
    const relationshipResult = await migrateCollection(client, RELATIONSHIP_COLLECTION);
    results.push(relationshipResult);

    // Print summary
    console.log('\n\n=== Migration Summary ===\n');
    console.log('Collection           | Found | Updated | Errors');
    console.log('---------------------|-------|---------|-------');

    let totalFound = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    for (const r of results) {
      console.log(
        `${r.collection.padEnd(20)} | ${String(r.found).padStart(5)} | ${String(r.updated).padStart(7)} | ${String(r.errors).padStart(6)}`
      );
      totalFound += r.found;
      totalUpdated += r.updated;
      totalErrors += r.errors;
    }

    console.log('---------------------|-------|---------|-------');
    console.log(
      `${'TOTAL'.padEnd(20)} | ${String(totalFound).padStart(5)} | ${String(totalUpdated).padStart(7)} | ${String(totalErrors).padStart(6)}`
    );

    console.log('\n=== Migration Complete ===');

    // Close connection
    await closeWeaviateClient();

    // Return results for programmatic use
    return {
      results,
      totals: {
        found: totalFound,
        updated: totalUpdated,
        errors: totalErrors,
      },
    };
  } catch (error) {
    console.error('Migration failed:', error);
    await closeWeaviateClient();
    throw error;
  }
}

// Run migration
migrate()
  .then((summary) => {
    console.log('\nMigration completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
