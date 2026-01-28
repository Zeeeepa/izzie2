#!/usr/bin/env tsx
/**
 * Import Deduplicated Contacts to Weaviate
 *
 * Reads contacts from data/contacts-deduped.json and imports them as
 * Person and Company entities into Weaviate using the existing saveEntities function.
 *
 * Usage:
 *   npx tsx scripts/contacts/import-to-weaviate.ts [options]
 *
 * Options:
 *   --dry-run       Show what would be imported without saving
 *   --user-id ID    User ID for entity ownership (default: apple-contacts-user)
 *   --batch-size N  Batch size for processing (default: 100)
 *   --limit N       Limit number of contacts to process (for testing)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { saveEntities } from '@/lib/weaviate/entities';
import type { Entity } from '@/lib/extraction/types';

const LOG_PREFIX = '[ImportContacts]';
const INPUT_PATH = '/Users/masa/Projects/izzie2/data/contacts-deduped.json';

// Types from dedup-contacts.ts
interface Email {
  address: string;
  label: string | null;
}

interface Phone {
  number: string;
  label: string | null;
}

interface MergedContact {
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  organization: string | null;
  nickname: string | null;
  title: string | null;
  suffix: string | null;
  department: string | null;
  jobTitle: string | null;
  emails: Email[];
  phones: Phone[];
  displayName: string;
  normalizedKey: string;
  originalIds: number[];
  mergeReason: 'exact' | 'ai-confirmed';
}

interface DeduplicationResult {
  totalContacts: number;
  exactDuplicates: number;
  fuzzyMatches: number;
  aiDecisions: number;
  mergedContacts: MergedContact[];
  processedAt: string;
}

interface Args {
  dryRun: boolean;
  userId: string;
  batchSize: number;
  limit: number | null;
  help: boolean;
}

function parseArgs(): Args {
  const args: Args = {
    dryRun: false,
    userId: 'apple-contacts-user',
    batchSize: 100,
    limit: null,
    help: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--user-id') {
      args.userId = process.argv[++i];
    } else if (arg === '--batch-size') {
      args.batchSize = parseInt(process.argv[++i], 10);
      if (isNaN(args.batchSize) || args.batchSize < 1) {
        console.error('Error: --batch-size requires a valid positive number');
        process.exit(1);
      }
    } else if (arg === '--limit') {
      args.limit = parseInt(process.argv[++i], 10);
      if (isNaN(args.limit) || args.limit < 1) {
        console.error('Error: --limit requires a valid positive number');
        process.exit(1);
      }
    }
  }

  return args;
}

function showHelp(): void {
  console.log(`
Import Deduplicated Contacts to Weaviate

Reads contacts from data/contacts-deduped.json and imports them as
Person and Company entities into Weaviate.

Usage:
  npx tsx scripts/contacts/import-to-weaviate.ts [options]

Options:
  --dry-run         Show what would be imported without saving
  --user-id ID      User ID for entity ownership (default: apple-contacts-user)
  --batch-size N    Batch size for processing (default: 100)
  --limit N         Limit number of contacts to process (for testing)
  --help, -h        Show this help message

Examples:
  # Import all contacts
  npx tsx scripts/contacts/import-to-weaviate.ts

  # Dry run to see what would be imported
  npx tsx scripts/contacts/import-to-weaviate.ts --dry-run

  # Import with custom user ID
  npx tsx scripts/contacts/import-to-weaviate.ts --user-id my-user-123

  # Test with first 50 contacts
  npx tsx scripts/contacts/import-to-weaviate.ts --limit 50
`);
}

/**
 * Build context string for a contact
 */
function buildContactContext(contact: MergedContact): string {
  const parts: string[] = [];

  if (contact.organization) {
    parts.push(`Org: ${contact.organization}`);
  }
  if (contact.jobTitle) {
    parts.push(`Title: ${contact.jobTitle}`);
  }
  if (contact.emails.length > 0) {
    const emailStr = contact.emails.map((e) => e.address).join(', ');
    parts.push(`Emails: ${emailStr}`);
  }
  if (contact.phones.length > 0) {
    const phoneStr = contact.phones.map((p) => p.number).join(', ');
    parts.push(`Phones: ${phoneStr}`);
  }

  return parts.join(' | ') || 'Apple Contacts import';
}

/**
 * Create Person entity from contact
 */
function createPersonEntity(contact: MergedContact): Entity {
  return {
    type: 'person',
    value: contact.displayName,
    normalized: contact.displayName.toLowerCase().replace(/\s+/g, '_'),
    confidence: 0.95,
    source: 'metadata',
    context: buildContactContext(contact),
  };
}

/**
 * Create Company entity from organization name
 */
function createCompanyEntity(orgName: string): Entity {
  return {
    type: 'company',
    value: orgName,
    normalized: orgName.toLowerCase().replace(/\s+/g, '_'),
    confidence: 0.95,
    source: 'metadata',
    context: 'Apple Contacts import',
  };
}

/**
 * Process contacts and create entities
 */
function processContacts(contacts: MergedContact[]): {
  personEntities: Entity[];
  companyEntities: Entity[];
  uniqueOrgs: Set<string>;
} {
  const personEntities: Entity[] = [];
  const uniqueOrgs = new Set<string>();

  for (const contact of contacts) {
    // Create Person entity
    if (contact.displayName && contact.displayName !== 'Unknown') {
      personEntities.push(createPersonEntity(contact));
    }

    // Track unique organizations
    if (contact.organization) {
      uniqueOrgs.add(contact.organization);
    }
  }

  // Create Company entities from unique organizations
  const companyEntities: Entity[] = Array.from(uniqueOrgs).map(createCompanyEntity);

  return { personEntities, companyEntities, uniqueOrgs };
}

/**
 * Save entities in batches
 */
async function saveEntitiesInBatches(
  entities: Entity[],
  userId: string,
  sourceId: string,
  batchSize: number,
  entityType: string,
  dryRun: boolean
): Promise<number> {
  let totalSaved = 0;
  const totalBatches = Math.ceil(entities.length / batchSize);

  for (let i = 0; i < entities.length; i += batchSize) {
    const batch = entities.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    if (dryRun) {
      console.log(
        `${LOG_PREFIX}   [DRY RUN] Batch ${batchNum}/${totalBatches}: Would save ${batch.length} ${entityType} entities`
      );
      totalSaved += batch.length;
    } else {
      try {
        await saveEntities(batch, userId, sourceId);
        totalSaved += batch.length;
        console.log(
          `${LOG_PREFIX}   Batch ${batchNum}/${totalBatches}: Saved ${batch.length} ${entityType} entities (total: ${totalSaved})`
        );
      } catch (error) {
        console.error(`${LOG_PREFIX}   Batch ${batchNum} failed:`, error);
      }
    }
  }

  return totalSaved;
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${LOG_PREFIX} Import Deduplicated Contacts to Weaviate`);
  console.log(`${'='.repeat(70)}\n`);

  if (args.dryRun) {
    console.log(`${LOG_PREFIX} DRY RUN MODE - No data will be saved\n`);
  }

  // Check input file exists
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`${LOG_PREFIX} Error: Input file not found at ${INPUT_PATH}`);
    console.error(`${LOG_PREFIX} Run 'npx tsx scripts/contacts/dedup-contacts.ts' first`);
    process.exit(1);
  }

  // Load contacts
  console.log(`${LOG_PREFIX} Loading contacts from ${INPUT_PATH}...`);
  const rawData = fs.readFileSync(INPUT_PATH, 'utf8');
  const data: DeduplicationResult = JSON.parse(rawData);

  let contacts = data.mergedContacts;
  console.log(`${LOG_PREFIX} Loaded ${contacts.length} deduplicated contacts\n`);

  // Apply limit if specified
  if (args.limit !== null) {
    contacts = contacts.slice(0, args.limit);
    console.log(`${LOG_PREFIX} Limited to ${contacts.length} contacts\n`);
  }

  // Process contacts into entities
  console.log(`${LOG_PREFIX} Processing contacts into entities...`);
  const { personEntities, companyEntities, uniqueOrgs } = processContacts(contacts);

  console.log(`${LOG_PREFIX} Created ${personEntities.length} Person entities`);
  console.log(`${LOG_PREFIX} Created ${companyEntities.length} Company entities (from ${uniqueOrgs.size} unique orgs)\n`);

  // Show sample entities
  console.log(`${LOG_PREFIX} Sample Person entities:`);
  for (const entity of personEntities.slice(0, 3)) {
    console.log(`${LOG_PREFIX}   - ${entity.value}`);
    console.log(`${LOG_PREFIX}     Context: ${entity.context?.substring(0, 80)}...`);
  }

  console.log(`\n${LOG_PREFIX} Sample Company entities:`);
  for (const entity of companyEntities.slice(0, 3)) {
    console.log(`${LOG_PREFIX}   - ${entity.value}`);
  }

  // Save entities
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${LOG_PREFIX} Saving entities to Weaviate`);
  console.log(`${'='.repeat(70)}\n`);

  console.log(`${LOG_PREFIX} User ID: ${args.userId}`);
  console.log(`${LOG_PREFIX} Batch size: ${args.batchSize}\n`);

  const sourceId = 'apple-contacts-import';

  // Save Person entities
  console.log(`${LOG_PREFIX} Saving Person entities...`);
  const personsSaved = await saveEntitiesInBatches(
    personEntities,
    args.userId,
    sourceId,
    args.batchSize,
    'person',
    args.dryRun
  );

  // Save Company entities
  console.log(`\n${LOG_PREFIX} Saving Company entities...`);
  const companiesSaved = await saveEntitiesInBatches(
    companyEntities,
    args.userId,
    sourceId,
    args.batchSize,
    'company',
    args.dryRun
  );

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${LOG_PREFIX} Import Complete`);
  console.log(`${'='.repeat(70)}`);
  console.log(`${LOG_PREFIX} Contacts processed: ${contacts.length}`);
  console.log(`${LOG_PREFIX} Person entities: ${personsSaved}`);
  console.log(`${LOG_PREFIX} Company entities: ${companiesSaved}`);
  console.log(`${LOG_PREFIX} Total entities: ${personsSaved + companiesSaved}`);

  if (args.dryRun) {
    console.log(`\n${LOG_PREFIX} DRY RUN - No data was saved`);
    console.log(`${LOG_PREFIX} Run without --dry-run to save entities`);
  }

  console.log(`${'='.repeat(70)}\n`);
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} Fatal error:`, error);
  process.exit(1);
});
