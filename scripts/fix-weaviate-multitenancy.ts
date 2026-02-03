/**
 * Fix Weaviate Multi-tenancy Migration
 *
 * This script fixes collections that were created without multi-tenancy enabled.
 * It will:
 * 1. Check which collections exist and whether they have multi-tenancy enabled
 * 2. Delete collections that don't have multi-tenancy enabled
 * 3. Re-create them with multi-tenancy enabled
 *
 * WARNING: This will delete all data in the affected collections!
 * Make sure to backup any important data before running.
 *
 * Usage:
 *   npx tsx scripts/fix-weaviate-multitenancy.ts
 *   npx tsx scripts/fix-weaviate-multitenancy.ts --dry-run  # Preview only
 */

import { config } from 'dotenv';
import weaviate from 'weaviate-client';
import {
  getWeaviateClient,
  closeWeaviateClient,
  isWeaviateReady,
} from '../src/lib/weaviate/client';
import {
  COLLECTIONS,
  RELATIONSHIP_COLLECTION,
  MEMORY_COLLECTION,
  RESEARCH_FINDING_COLLECTION_NAME,
} from '../src/lib/weaviate/schema';

// Load environment variables
config({ path: '.env.local' });

const LOG_PREFIX = '[Fix Multi-tenancy]';

// All collections that should have multi-tenancy enabled
const ALL_COLLECTIONS = [
  ...Object.values(COLLECTIONS),
  RELATIONSHIP_COLLECTION,
  MEMORY_COLLECTION,
  RESEARCH_FINDING_COLLECTION_NAME,
];

// Collection definitions for re-creation
const COLLECTION_DEFINITIONS: Record<string, {
  description: string;
  properties: Array<{ name: string; dataType: string; description: string }>;
}> = {
  Person: {
    description: 'Person entities extracted from emails and calendar events',
    properties: [
      { name: 'value', dataType: 'text', description: 'Original person name' },
      { name: 'normalized', dataType: 'text', description: 'Normalized person name' },
      { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
      { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
      { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
      { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
      { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
      { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      { name: 'aliases', dataType: 'text[]', description: 'Known aliases/nicknames for deduplication' },
    ],
  },
  Company: {
    description: 'Company/organization entities',
    properties: [
      { name: 'value', dataType: 'text', description: 'Original company name' },
      { name: 'normalized', dataType: 'text', description: 'Normalized company name' },
      { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
      { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
      { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
      { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
      { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
      { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      { name: 'aliases', dataType: 'text[]', description: 'Known aliases/nicknames for deduplication' },
    ],
  },
  Project: {
    description: 'Project entities',
    properties: [
      { name: 'value', dataType: 'text', description: 'Original project name' },
      { name: 'normalized', dataType: 'text', description: 'Normalized project name' },
      { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
      { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
      { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
      { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
      { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
      { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      { name: 'aliases', dataType: 'text[]', description: 'Known aliases/nicknames for deduplication' },
    ],
  },
  Tool: {
    description: 'Software tools, platforms, APIs, and services',
    properties: [
      { name: 'value', dataType: 'text', description: 'Original tool name' },
      { name: 'normalized', dataType: 'text', description: 'Normalized tool name' },
      { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
      { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
      { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
      { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
      { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
      { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      { name: 'aliases', dataType: 'text[]', description: 'Known aliases/nicknames for deduplication' },
    ],
  },
  Topic: {
    description: 'Topic/subject entities',
    properties: [
      { name: 'value', dataType: 'text', description: 'Original topic' },
      { name: 'normalized', dataType: 'text', description: 'Normalized topic' },
      { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
      { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
      { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
      { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
      { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
      { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      { name: 'aliases', dataType: 'text[]', description: 'Known aliases/nicknames for deduplication' },
    ],
  },
  Location: {
    description: 'Location entities',
    properties: [
      { name: 'value', dataType: 'text', description: 'Original location' },
      { name: 'normalized', dataType: 'text', description: 'Normalized location' },
      { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
      { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
      { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
      { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
      { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
      { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      { name: 'aliases', dataType: 'text[]', description: 'Known aliases/nicknames for deduplication' },
    ],
  },
  ActionItem: {
    description: 'Action item entities with assignee and deadline',
    properties: [
      { name: 'value', dataType: 'text', description: 'Original action item text' },
      { name: 'normalized', dataType: 'text', description: 'Normalized action item' },
      { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
      { name: 'source', dataType: 'text', description: 'Source: metadata, body, or subject' },
      { name: 'sourceId', dataType: 'text', description: 'Email or event ID' },
      { name: 'userId', dataType: 'text', description: 'User ID who owns this entity' },
      { name: 'extractedAt', dataType: 'text', description: 'ISO timestamp of extraction' },
      { name: 'context', dataType: 'text', description: 'Surrounding text context' },
      { name: 'aliases', dataType: 'text[]', description: 'Known aliases/nicknames for deduplication' },
      { name: 'assignee', dataType: 'text', description: 'Person assigned to action item' },
      { name: 'deadline', dataType: 'text', description: 'Deadline for action item' },
      { name: 'priority', dataType: 'text', description: 'Priority: low, medium, high' },
    ],
  },
  Relationship: {
    description: 'Inferred relationships between entities',
    properties: [
      { name: 'fromEntityType', dataType: 'text', description: 'Source entity type' },
      { name: 'fromEntityValue', dataType: 'text', description: 'Source entity normalized value' },
      { name: 'toEntityType', dataType: 'text', description: 'Target entity type' },
      { name: 'toEntityValue', dataType: 'text', description: 'Target entity normalized value' },
      { name: 'relationshipType', dataType: 'text', description: 'Type of relationship (WORKS_WITH, etc.)' },
      { name: 'confidence', dataType: 'number', description: 'Confidence score (0-1)' },
      { name: 'evidence', dataType: 'text', description: 'Evidence/context for relationship' },
      { name: 'sourceId', dataType: 'text', description: 'Source email/event ID' },
      { name: 'userId', dataType: 'text', description: 'User ID who owns this relationship' },
      { name: 'inferredAt', dataType: 'text', description: 'ISO timestamp of inference' },
    ],
  },
  Memory: {
    description: 'User memories with temporal decay',
    properties: [
      { name: 'userId', dataType: 'text', description: 'User ID who owns this memory' },
      { name: 'content', dataType: 'text', description: 'Memory content' },
      { name: 'category', dataType: 'text', description: 'Memory category' },
      { name: 'sourceType', dataType: 'text', description: 'Source type (email, calendar, etc.)' },
      { name: 'sourceId', dataType: 'text', description: 'Source ID' },
      { name: 'sourceDate', dataType: 'text', description: 'ISO date when memory was observed' },
      { name: 'importance', dataType: 'number', description: 'Importance rating (0-1)' },
      { name: 'decayRate', dataType: 'number', description: 'Decay rate per day' },
      { name: 'lastAccessed', dataType: 'text', description: 'ISO date of last access' },
      { name: 'expiresAt', dataType: 'text', description: 'ISO date of expiration (nullable)' },
      { name: 'confidence', dataType: 'number', description: 'Extraction confidence (0-1)' },
      { name: 'relatedEntities', dataType: 'text', description: 'JSON array of related entity names' },
      { name: 'tags', dataType: 'text', description: 'JSON array of tags' },
      { name: 'createdAt', dataType: 'text', description: 'ISO date of creation' },
      { name: 'updatedAt', dataType: 'text', description: 'ISO date of last update' },
      { name: 'isDeleted', dataType: 'boolean', description: 'Soft delete flag' },
    ],
  },
  ResearchFinding: {
    description: 'Research findings with claims, evidence, and citations',
    properties: [
      { name: 'claim', dataType: 'text', description: 'The research finding or claim' },
      { name: 'evidence', dataType: 'text', description: 'Supporting evidence for the claim' },
      { name: 'confidence', dataType: 'number', description: 'Confidence score (0-100)' },
      { name: 'taskId', dataType: 'text', description: 'Reference to agent_tasks table' },
      { name: 'sourceUrl', dataType: 'text', description: 'URL of the source' },
      { name: 'sourceTitle', dataType: 'text', description: 'Title of the source' },
      { name: 'quote', dataType: 'text', description: 'Direct quote from source supporting the finding' },
      { name: 'userId', dataType: 'text', description: 'User ID who owns this finding' },
      { name: 'createdAt', dataType: 'text', description: 'ISO timestamp of creation' },
    ],
  },
};

interface CollectionStatus {
  name: string;
  exists: boolean;
  multiTenancyEnabled: boolean | null;
  needsFix: boolean;
}

/**
 * Check multi-tenancy status for a collection
 */
async function checkCollectionStatus(
  client: Awaited<ReturnType<typeof getWeaviateClient>>,
  collectionName: string
): Promise<CollectionStatus> {
  try {
    const exists = await client.collections.exists(collectionName);

    if (!exists) {
      return {
        name: collectionName,
        exists: false,
        multiTenancyEnabled: null,
        needsFix: false,
      };
    }

    // Get collection config to check multi-tenancy
    const collection = client.collections.get(collectionName);

    // Try to get tenants - if multi-tenancy is disabled, this will throw
    try {
      await collection.tenants.get();
      return {
        name: collectionName,
        exists: true,
        multiTenancyEnabled: true,
        needsFix: false,
      };
    } catch (error: any) {
      // If the error mentions multi-tenancy not enabled, we need to fix it
      if (error.message?.includes('multi-tenancy is not enabled')) {
        return {
          name: collectionName,
          exists: true,
          multiTenancyEnabled: false,
          needsFix: true,
        };
      }
      // Other error - re-throw
      throw error;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error checking collection ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Fix a collection by deleting and re-creating it with multi-tenancy enabled
 */
async function fixCollection(
  client: Awaited<ReturnType<typeof getWeaviateClient>>,
  collectionName: string,
  dryRun: boolean
): Promise<void> {
  const definition = COLLECTION_DEFINITIONS[collectionName];

  if (!definition) {
    console.error(`${LOG_PREFIX} No definition found for collection ${collectionName}`);
    return;
  }

  if (dryRun) {
    console.log(`${LOG_PREFIX} [DRY RUN] Would delete and re-create collection: ${collectionName}`);
    return;
  }

  console.log(`${LOG_PREFIX} Deleting collection: ${collectionName}...`);
  await client.collections.delete(collectionName);

  console.log(`${LOG_PREFIX} Re-creating collection with multi-tenancy: ${collectionName}...`);
  await client.collections.create({
    name: collectionName,
    description: definition.description,
    properties: definition.properties as any,
    multiTenancy: weaviate.configure.multiTenancy({ enabled: true }),
  });

  console.log(`${LOG_PREFIX} Successfully fixed collection: ${collectionName}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('===============================================');
  console.log(' Weaviate Multi-tenancy Fix Script');
  console.log('===============================================');
  if (dryRun) {
    console.log('\n*** DRY RUN MODE - No changes will be made ***\n');
  } else {
    console.log('\n*** LIVE MODE - Collections will be modified ***\n');
    console.log('WARNING: This will DELETE data in affected collections!');
    console.log('Press Ctrl+C within 5 seconds to abort...\n');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  try {
    // Check connection
    console.log(`${LOG_PREFIX} Testing Weaviate connection...`);
    const ready = await isWeaviateReady();

    if (!ready) {
      console.error(`${LOG_PREFIX} Weaviate is not ready. Check your credentials.`);
      process.exit(1);
    }

    console.log(`${LOG_PREFIX} Weaviate connection successful\n`);

    const client = await getWeaviateClient();

    // Check all collections
    console.log(`${LOG_PREFIX} Checking collection status...\n`);

    const statuses: CollectionStatus[] = [];
    for (const collectionName of ALL_COLLECTIONS) {
      const status = await checkCollectionStatus(client, collectionName);
      statuses.push(status);

      const statusIcon = status.needsFix
        ? '!!'
        : status.exists
          ? (status.multiTenancyEnabled ? 'OK' : '??')
          : '--';

      console.log(
        `  [${statusIcon}] ${collectionName.padEnd(20)} | ` +
        `exists: ${status.exists ? 'yes' : 'no'.padEnd(3)} | ` +
        `multi-tenancy: ${status.multiTenancyEnabled === null ? 'N/A' : status.multiTenancyEnabled ? 'yes' : 'NO '}`
      );
    }

    // Find collections that need fixing
    const collectionsToFix = statuses.filter((s) => s.needsFix);

    console.log('\n===============================================');

    if (collectionsToFix.length === 0) {
      console.log(`${LOG_PREFIX} All collections have multi-tenancy enabled. Nothing to fix.`);
    } else {
      console.log(`${LOG_PREFIX} Found ${collectionsToFix.length} collection(s) that need fixing:\n`);

      for (const status of collectionsToFix) {
        console.log(`  - ${status.name}`);
      }

      console.log('');

      // Fix each collection
      for (const status of collectionsToFix) {
        await fixCollection(client, status.name, dryRun);
      }

      if (dryRun) {
        console.log(`\n${LOG_PREFIX} Dry run complete. Run without --dry-run to apply changes.`);
      } else {
        console.log(`\n${LOG_PREFIX} All collections fixed successfully!`);
      }
    }
  } catch (error) {
    console.error(`\n${LOG_PREFIX} Migration failed:`, error);
    process.exit(1);
  } finally {
    await closeWeaviateClient();
  }
}

main();
