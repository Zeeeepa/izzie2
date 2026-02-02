/**
 * Migration Script: Migrate Existing Data to Multi-Tenancy
 *
 * This script migrates existing Weaviate data to the new multi-tenant schema.
 *
 * Strategy:
 * 1. Create new v2 collections with multi-tenancy enabled
 * 2. For each unique userId in the old data:
 *    a. Create a tenant for that user
 *    b. Copy all their data to the tenant-specific shard
 * 3. Verify data integrity
 * 4. Optionally drop old collections
 *
 * Usage:
 *   npx tsx scripts/migrate-to-multi-tenancy.ts [--dry-run] [--drop-old]
 *
 * Options:
 *   --dry-run   Preview what would be migrated without making changes
 *   --drop-old  Delete old collections after successful migration
 */

import weaviate from 'weaviate-client';
import { getWeaviateClient, closeWeaviateClient } from '../src/lib/weaviate/client';
import { COLLECTIONS, RELATIONSHIP_COLLECTION } from '../src/lib/weaviate/schema';

const LOG_PREFIX = '[Migration]';

// Collection definitions for v2 (with multi-tenancy)
const V2_SUFFIX = '_v2';
const MEMORY_COLLECTION = 'Memory';
const RESEARCH_FINDING_COLLECTION = 'ResearchFinding';

interface MigrationStats {
  collection: string;
  totalObjects: number;
  uniqueUsers: number;
  tenantsCreated: number;
  objectsMigrated: number;
  errors: number;
}

/**
 * Get all unique userIds from a collection
 */
async function getUniqueUserIds(
  client: any,
  collectionName: string
): Promise<Set<string>> {
  const userIds = new Set<string>();

  try {
    const collection = client.collections.get(collectionName);
    const result = await collection.query.fetchObjects({
      limit: 100000,
      returnProperties: ['userId'],
    });

    for (const obj of result.objects) {
      if (obj.properties.userId) {
        userIds.add(obj.properties.userId);
      }
    }

    console.log(`${LOG_PREFIX} Found ${userIds.size} unique users in ${collectionName}`);
  } catch (error) {
    // Collection might not exist
    console.log(`${LOG_PREFIX} Collection ${collectionName} not found or empty`);
  }

  return userIds;
}

/**
 * Create v2 collection with multi-tenancy enabled
 */
async function createV2Collection(
  client: any,
  originalName: string,
  properties: any[]
): Promise<void> {
  const v2Name = `${originalName}${V2_SUFFIX}`;

  try {
    const exists = await client.collections.exists(v2Name);
    if (exists) {
      console.log(`${LOG_PREFIX} Collection ${v2Name} already exists, skipping creation`);
      return;
    }

    await client.collections.create({
      name: v2Name,
      properties,
      multiTenancy: weaviate.configure.multiTenancy({ enabled: true }),
    });

    console.log(`${LOG_PREFIX} Created collection ${v2Name} with multi-tenancy`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create ${v2Name}:`, error);
    throw error;
  }
}

/**
 * Migrate data from old collection to new multi-tenant collection
 */
async function migrateCollection(
  client: any,
  collectionName: string,
  dryRun: boolean
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    collection: collectionName,
    totalObjects: 0,
    uniqueUsers: 0,
    tenantsCreated: 0,
    objectsMigrated: 0,
    errors: 0,
  };

  try {
    const oldCollection = client.collections.get(collectionName);
    const v2Name = `${collectionName}${V2_SUFFIX}`;
    const newCollection = client.collections.get(v2Name);

    // Get all objects from old collection
    const result = await oldCollection.query.fetchObjects({
      limit: 100000,
    });

    stats.totalObjects = result.objects.length;

    if (stats.totalObjects === 0) {
      console.log(`${LOG_PREFIX} No objects in ${collectionName}, skipping`);
      return stats;
    }

    // Group objects by userId
    const objectsByUser = new Map<string, any[]>();
    for (const obj of result.objects) {
      const userId = obj.properties.userId || 'unknown';
      if (!objectsByUser.has(userId)) {
        objectsByUser.set(userId, []);
      }
      objectsByUser.get(userId)!.push(obj);
    }

    stats.uniqueUsers = objectsByUser.size;
    console.log(`${LOG_PREFIX} Migrating ${stats.totalObjects} objects for ${stats.uniqueUsers} users in ${collectionName}`);

    if (dryRun) {
      console.log(`${LOG_PREFIX} [DRY RUN] Would migrate ${stats.totalObjects} objects`);
      return stats;
    }

    // Migrate each user's data to their tenant
    for (const [userId, objects] of objectsByUser) {
      try {
        // Create tenant for this user
        await newCollection.tenants.create([{ name: userId }]);
        stats.tenantsCreated++;

        // Get tenant-specific collection handle
        const tenantCollection = newCollection.withTenant(userId);

        // Prepare objects for insertion (strip uuid, keep properties)
        const newObjects = objects.map((obj) => obj.properties);

        // Insert in batches of 100
        const batchSize = 100;
        for (let i = 0; i < newObjects.length; i += batchSize) {
          const batch = newObjects.slice(i, i + batchSize);
          const insertResult = await tenantCollection.data.insertMany(batch);
          stats.objectsMigrated += insertResult.uuids
            ? Object.keys(insertResult.uuids).length
            : 0;
        }

        console.log(`${LOG_PREFIX} Migrated ${objects.length} objects for user ${userId}`);
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to migrate user ${userId}:`, error);
        stats.errors++;
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to migrate ${collectionName}:`, error);
    stats.errors++;
  }

  return stats;
}

/**
 * Verify migration by comparing counts
 */
async function verifyMigration(
  client: any,
  collectionName: string
): Promise<boolean> {
  try {
    const oldCollection = client.collections.get(collectionName);
    const v2Name = `${collectionName}${V2_SUFFIX}`;
    const newCollection = client.collections.get(v2Name);

    // Get count from old collection
    const oldResult = await oldCollection.query.fetchObjects({ limit: 100000 });
    const oldCount = oldResult.objects.length;

    // Get total count from all tenants in new collection
    const tenants = await newCollection.tenants.get();
    let newCount = 0;

    for (const tenant of tenants) {
      const tenantCollection = newCollection.withTenant(tenant.name);
      const result = await tenantCollection.query.fetchObjects({ limit: 100000 });
      newCount += result.objects.length;
    }

    const isValid = oldCount === newCount;

    if (isValid) {
      console.log(`${LOG_PREFIX} Verification passed for ${collectionName}: ${oldCount} objects`);
    } else {
      console.error(`${LOG_PREFIX} Verification FAILED for ${collectionName}: old=${oldCount}, new=${newCount}`);
    }

    return isValid;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to verify ${collectionName}:`, error);
    return false;
  }
}

/**
 * Drop old collection after successful migration
 */
async function dropOldCollection(
  client: any,
  collectionName: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    console.log(`${LOG_PREFIX} [DRY RUN] Would drop ${collectionName}`);
    return;
  }

  try {
    await client.collections.delete(collectionName);
    console.log(`${LOG_PREFIX} Dropped old collection ${collectionName}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to drop ${collectionName}:`, error);
  }
}

/**
 * Rename v2 collection to original name
 */
async function renameV2ToOriginal(
  client: any,
  collectionName: string,
  dryRun: boolean
): Promise<void> {
  // Note: Weaviate doesn't support renaming collections directly.
  // After dropping the old collection, users should update their code to use the v2 collections
  // or manually recreate the collection structure.

  console.log(
    `${LOG_PREFIX} Note: Weaviate doesn't support collection renaming. ` +
      `The new collection is available as ${collectionName}${V2_SUFFIX}. ` +
      `Update your code to use the v2 collections.`
  );
}

/**
 * Main migration function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dropOld = args.includes('--drop-old');

  console.log(`${LOG_PREFIX} Starting multi-tenancy migration...`);
  console.log(`${LOG_PREFIX} Options: dry-run=${dryRun}, drop-old=${dropOld}`);

  const client = await getWeaviateClient();

  // All collections to migrate
  const collectionsToMigrate = [
    ...Object.values(COLLECTIONS),
    RELATIONSHIP_COLLECTION,
    MEMORY_COLLECTION,
    RESEARCH_FINDING_COLLECTION,
  ];

  // Define properties for each collection (you may need to adjust based on your schema)
  const collectionProperties: Record<string, any[]> = {
    Person: [
      { name: 'value', dataType: 'text' },
      { name: 'normalized', dataType: 'text' },
      { name: 'confidence', dataType: 'number' },
      { name: 'source', dataType: 'text' },
      { name: 'sourceId', dataType: 'text' },
      { name: 'userId', dataType: 'text' },
      { name: 'extractedAt', dataType: 'text' },
      { name: 'context', dataType: 'text' },
    ],
    // Common entity properties (same for Company, Project, Tool, Topic, Location)
  };

  // Use same properties for all entity collections
  const entityCollections = ['Company', 'Project', 'Tool', 'Topic', 'Location'];
  for (const name of entityCollections) {
    collectionProperties[name] = collectionProperties.Person;
  }

  // ActionItem has additional properties
  collectionProperties.ActionItem = [
    ...collectionProperties.Person,
    { name: 'assignee', dataType: 'text' },
    { name: 'deadline', dataType: 'text' },
    { name: 'priority', dataType: 'text' },
  ];

  // Relationship properties
  collectionProperties.Relationship = [
    { name: 'fromEntityType', dataType: 'text' },
    { name: 'fromEntityValue', dataType: 'text' },
    { name: 'toEntityType', dataType: 'text' },
    { name: 'toEntityValue', dataType: 'text' },
    { name: 'relationshipType', dataType: 'text' },
    { name: 'confidence', dataType: 'number' },
    { name: 'evidence', dataType: 'text' },
    { name: 'sourceId', dataType: 'text' },
    { name: 'userId', dataType: 'text' },
    { name: 'inferredAt', dataType: 'text' },
  ];

  // Memory properties
  collectionProperties.Memory = [
    { name: 'userId', dataType: 'text' },
    { name: 'content', dataType: 'text' },
    { name: 'category', dataType: 'text' },
    { name: 'sourceType', dataType: 'text' },
    { name: 'sourceId', dataType: 'text' },
    { name: 'sourceDate', dataType: 'text' },
    { name: 'importance', dataType: 'number' },
    { name: 'decayRate', dataType: 'number' },
    { name: 'lastAccessed', dataType: 'text' },
    { name: 'expiresAt', dataType: 'text' },
    { name: 'confidence', dataType: 'number' },
    { name: 'relatedEntities', dataType: 'text' },
    { name: 'tags', dataType: 'text' },
    { name: 'createdAt', dataType: 'text' },
    { name: 'updatedAt', dataType: 'text' },
    { name: 'isDeleted', dataType: 'boolean' },
  ];

  // ResearchFinding properties
  collectionProperties.ResearchFinding = [
    { name: 'claim', dataType: 'text' },
    { name: 'evidence', dataType: 'text' },
    { name: 'confidence', dataType: 'number' },
    { name: 'taskId', dataType: 'text' },
    { name: 'sourceUrl', dataType: 'text' },
    { name: 'sourceTitle', dataType: 'text' },
    { name: 'quote', dataType: 'text' },
    { name: 'userId', dataType: 'text' },
    { name: 'createdAt', dataType: 'text' },
  ];

  const allStats: MigrationStats[] = [];

  // Step 1: Create v2 collections
  console.log(`${LOG_PREFIX} Step 1: Creating v2 collections with multi-tenancy...`);
  for (const collectionName of collectionsToMigrate) {
    if (collectionProperties[collectionName] && !dryRun) {
      await createV2Collection(client, collectionName, collectionProperties[collectionName]);
    } else if (dryRun) {
      console.log(`${LOG_PREFIX} [DRY RUN] Would create ${collectionName}${V2_SUFFIX}`);
    }
  }

  // Step 2: Migrate data
  console.log(`${LOG_PREFIX} Step 2: Migrating data to v2 collections...`);
  for (const collectionName of collectionsToMigrate) {
    const stats = await migrateCollection(client, collectionName, dryRun);
    allStats.push(stats);
  }

  // Step 3: Verify migration
  if (!dryRun) {
    console.log(`${LOG_PREFIX} Step 3: Verifying migration...`);
    let allVerified = true;
    for (const collectionName of collectionsToMigrate) {
      const verified = await verifyMigration(client, collectionName);
      if (!verified) {
        allVerified = false;
      }
    }

    if (!allVerified) {
      console.error(`${LOG_PREFIX} Migration verification failed! Not dropping old collections.`);
      await closeWeaviateClient();
      process.exit(1);
    }
  }

  // Step 4: Drop old collections (if requested and verified)
  if (dropOld && !dryRun) {
    console.log(`${LOG_PREFIX} Step 4: Dropping old collections...`);
    for (const collectionName of collectionsToMigrate) {
      await dropOldCollection(client, collectionName, dryRun);
    }
  }

  // Print summary
  console.log(`\n${LOG_PREFIX} Migration Summary:`);
  console.log('='.repeat(80));
  for (const stats of allStats) {
    console.log(
      `  ${stats.collection}: ` +
        `${stats.totalObjects} objects, ` +
        `${stats.uniqueUsers} users, ` +
        `${stats.tenantsCreated} tenants created, ` +
        `${stats.objectsMigrated} migrated, ` +
        `${stats.errors} errors`
    );
  }
  console.log('='.repeat(80));

  const totalErrors = allStats.reduce((sum, s) => sum + s.errors, 0);
  if (totalErrors > 0) {
    console.error(`${LOG_PREFIX} Migration completed with ${totalErrors} errors`);
    await closeWeaviateClient();
    process.exit(1);
  }

  console.log(`${LOG_PREFIX} Migration completed successfully!`);

  if (!dropOld) {
    console.log(
      `${LOG_PREFIX} Note: Old collections are still present. ` +
        `Run with --drop-old to remove them after verifying the migration.`
    );
  }

  console.log(
    `${LOG_PREFIX} Important: Update your application code to use the v2 collections ` +
      `and the new multi-tenant APIs.`
  );

  await closeWeaviateClient();
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} Migration failed:`, error);
  process.exit(1);
});
