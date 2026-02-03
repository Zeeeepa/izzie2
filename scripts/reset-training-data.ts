#!/usr/bin/env npx tsx
/**
 * Reset Training/Discovery Data Script
 *
 * Clears all training and discovery data to allow a fresh start with improved
 * entity extraction prompts. This script clears:
 *
 * 1. Database tables:
 *    - training_sessions
 *    - training_samples
 *    - training_exceptions
 *    - training_progress
 *    - extraction_progress
 *
 * 2. Weaviate collections (per-user tenant data):
 *    - Person, Company, Project, Tool, Topic, Location, ActionItem
 *    - Relationship
 *    - Memory (optional)
 *
 * 3. Local files:
 *    - data/feedback/*.jsonl
 *
 * Usage:
 *   npx tsx scripts/reset-training-data.ts --user <userId>
 *   npx tsx scripts/reset-training-data.ts --user <userId> --include-memory
 *   npx tsx scripts/reset-training-data.ts --user <userId> --dry-run
 *
 * Options:
 *   --user <userId>     Required: User ID to reset data for
 *   --include-memory    Also clear Memory collection (default: false)
 *   --dry-run           Show what would be deleted without making changes
 *   --help              Show this help message
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { dbClient } from '../src/lib/db/client';
import {
  trainingSessions,
  trainingSamples,
  trainingExceptions,
  trainingProgress,
  extractionProgress,
} from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

// Get db instance after initialization
let db: ReturnType<typeof dbClient.getDb>;
import {
  deleteTenantFromAllCollections,
  ALL_MULTI_TENANT_COLLECTIONS,
  COLLECTIONS,
  RELATIONSHIP_COLLECTION,
  MEMORY_COLLECTION,
  getWeaviateClient,
  closeWeaviateClient,
} from '../src/lib/weaviate';

const LOG_PREFIX = '[Reset Training]';

interface CliArgs {
  userId: string | null;
  includeMemory: boolean;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    userId: null,
    includeMemory: false,
    dryRun: false,
    help: false,
  };

  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--user':
        args.userId = argv[++i];
        if (!args.userId) {
          console.error('Error: --user requires a user ID');
          process.exit(1);
        }
        break;

      case '--include-memory':
        args.includeMemory = true;
        break;

      case '--dry-run':
        args.dryRun = true;
        break;

      case '--help':
      case '-h':
        args.help = true;
        break;

      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return args;
}

function showHelp(): void {
  console.log(`
Reset Training/Discovery Data Script

Clears all training and discovery data to allow a fresh start with improved
entity extraction prompts.

Usage:
  npx tsx scripts/reset-training-data.ts --user <userId>
  npx tsx scripts/reset-training-data.ts --user <userId> --include-memory
  npx tsx scripts/reset-training-data.ts --user <userId> --dry-run

Options:
  --user <userId>     Required: User ID to reset data for
  --include-memory    Also clear Memory collection (default: false)
  --dry-run           Show what would be deleted without making changes
  --help, -h          Show this help message

What gets cleared:
  - Database: training_sessions, training_samples, training_exceptions,
              training_progress, extraction_progress
  - Weaviate: Person, Company, Project, Tool, Topic, Location, ActionItem,
              Relationship collections (tenant-specific)
  - Files: data/feedback/*.jsonl

Examples:
  # Reset for user with dry-run preview
  npx tsx scripts/reset-training-data.ts --user abc123 --dry-run

  # Reset including memory data
  npx tsx scripts/reset-training-data.ts --user abc123 --include-memory
`);
}

async function clearDatabaseTables(userId: string, dryRun: boolean): Promise<void> {
  console.log('\n--- Clearing Database Tables ---');

  // Tables to clear with their user ID column (using raw SQL for robustness)
  const tables = [
    { name: 'training_samples', userIdColumn: null, sessionBased: true },
    { name: 'training_exceptions', userIdColumn: 'user_id', sessionBased: false },
    { name: 'training_progress', userIdColumn: 'user_id', sessionBased: false },
    { name: 'training_sessions', userIdColumn: 'user_id', sessionBased: false },
    { name: 'extraction_progress', userIdColumn: 'user_id', sessionBased: false },
  ];

  // First, get training session IDs for this user (to clear samples)
  let sessionIds: string[] = [];
  try {
    const sessionResult = await dbClient.executeRaw<{ id: string }>(
      'SELECT id FROM training_sessions WHERE user_id = $1',
      [userId]
    );
    sessionIds = sessionResult.map((s) => s.id);
    console.log(`${LOG_PREFIX} Found ${sessionIds.length} training sessions for user`);
  } catch (error) {
    console.log(`${LOG_PREFIX} Could not query training_sessions (table may not exist)`);
  }

  for (const { name, userIdColumn, sessionBased } of tables) {
    try {
      // Check if table exists first
      const tableExists = await dbClient.executeRaw<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) as exists`,
        [name]
      );

      if (!tableExists[0]?.exists) {
        console.log(`  Skipping ${name} (table does not exist)`);
        continue;
      }

      let count = 0;

      if (sessionBased && sessionIds.length > 0) {
        // Delete samples by session IDs
        const countResult = await dbClient.executeRaw<{ count: string }>(
          `SELECT COUNT(*) as count FROM ${name} WHERE session_id = ANY($1)`,
          [sessionIds]
        );
        count = parseInt(countResult[0]?.count || '0', 10);

        if (!dryRun && count > 0) {
          await dbClient.executeRaw(
            `DELETE FROM ${name} WHERE session_id = ANY($1)`,
            [sessionIds]
          );
        }
      } else if (userIdColumn) {
        // Count and delete by userId
        const countResult = await dbClient.executeRaw<{ count: string }>(
          `SELECT COUNT(*) as count FROM ${name} WHERE ${userIdColumn} = $1`,
          [userId]
        );
        count = parseInt(countResult[0]?.count || '0', 10);

        if (!dryRun && count > 0) {
          await dbClient.executeRaw(
            `DELETE FROM ${name} WHERE ${userIdColumn} = $1`,
            [userId]
          );
        }
      }

      if (dryRun) {
        console.log(`  [DRY-RUN] Would delete ${count} rows from ${name}`);
      } else {
        console.log(`  Deleted ${count} rows from ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  Error clearing ${name}: ${errorMessage}`);
    }
  }
}

async function clearWeaviateData(
  userId: string,
  includeMemory: boolean,
  dryRun: boolean
): Promise<void> {
  console.log('\n--- Clearing Weaviate Data ---');

  // Determine which collections to clear
  const collectionsToDelete = [
    ...Object.values(COLLECTIONS),
    RELATIONSHIP_COLLECTION,
  ];

  if (includeMemory) {
    collectionsToDelete.push(MEMORY_COLLECTION);
    console.log(`${LOG_PREFIX} Including Memory collection in reset`);
  }

  console.log(`${LOG_PREFIX} Will clear tenant '${userId}' from ${collectionsToDelete.length} collections`);

  if (dryRun) {
    console.log(`  [DRY-RUN] Would delete tenant '${userId}' from:`);
    for (const collection of collectionsToDelete) {
      console.log(`    - ${collection}`);
    }
    return;
  }

  try {
    const client = await getWeaviateClient();

    for (const collectionName of collectionsToDelete) {
      try {
        // Check if collection exists
        const exists = await client.collections.exists(collectionName);
        if (!exists) {
          console.log(`  Skipping ${collectionName} (collection does not exist)`);
          continue;
        }

        const collection = client.collections.get(collectionName);

        // Check if tenant exists
        const existingTenants = await collection.tenants.get();
        if (!(userId in existingTenants)) {
          console.log(`  Skipping ${collectionName} (tenant '${userId}' does not exist)`);
          continue;
        }

        // Delete the tenant (this removes all data for this user)
        await collection.tenants.remove([userId]);
        console.log(`  Deleted tenant '${userId}' from ${collectionName}`);
      } catch (error) {
        console.error(`  Error clearing ${collectionName}:`, error);
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Weaviate connection error:`, error);
    console.log(`  Note: Weaviate data could not be cleared. You may need to check Weaviate connection.`);
  }
}

function clearFeedbackFiles(dryRun: boolean): void {
  console.log('\n--- Clearing Feedback Files ---');

  const feedbackDir = path.join(process.cwd(), 'data', 'feedback');

  if (!fs.existsSync(feedbackDir)) {
    console.log(`  Feedback directory does not exist: ${feedbackDir}`);
    return;
  }

  const files = fs.readdirSync(feedbackDir).filter((f) => f.endsWith('.jsonl'));

  if (files.length === 0) {
    console.log('  No feedback files found');
    return;
  }

  for (const file of files) {
    const filePath = path.join(feedbackDir, file);
    if (dryRun) {
      console.log(`  [DRY-RUN] Would delete: ${filePath}`);
    } else {
      fs.unlinkSync(filePath);
      console.log(`  Deleted: ${filePath}`);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (!args.userId) {
    console.error('Error: --user <userId> is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Reset Training/Discovery Data');
  console.log('='.repeat(60));
  console.log(`User ID: ${args.userId}`);
  console.log(`Include Memory: ${args.includeMemory}`);
  console.log(`Dry Run: ${args.dryRun}`);

  if (args.dryRun) {
    console.log('\n*** DRY RUN MODE - No changes will be made ***');
  }

  try {
    // Initialize database connection
    console.log('\n--- Connecting to Database ---');
    dbClient.initialize();
    const isConnected = await dbClient.verifyConnection();

    if (!isConnected) {
      console.error('Failed to connect to database');
      process.exit(1);
    }
    console.log('Connected to database');

    // Get db instance after initialization
    db = dbClient.getDb();

    // Clear database tables
    await clearDatabaseTables(args.userId, args.dryRun);

    // Clear Weaviate data
    await clearWeaviateData(args.userId, args.includeMemory, args.dryRun);

    // Clear feedback files
    clearFeedbackFiles(args.dryRun);

    // Summary
    console.log('\n' + '='.repeat(60));
    if (args.dryRun) {
      console.log('DRY RUN COMPLETE - No changes were made');
      console.log('Run without --dry-run to execute the reset');
    } else {
      console.log('RESET COMPLETE');
      console.log(`All training/discovery data for user '${args.userId}' has been cleared.`);
      console.log('You can now start fresh with improved entity extraction prompts.');
    }
    console.log('='.repeat(60));

    // Close connections
    await dbClient.close();
    await closeWeaviateClient();
  } catch (error) {
    console.error(`${LOG_PREFIX} Fatal error:`, error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
