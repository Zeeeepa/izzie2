/**
 * Changelog Ingestion
 *
 * Store changelog entries in Weaviate for RAG retrieval.
 * Enables Izzie to answer "what's new?" or "can Izzie do X?" questions.
 */

import { getWeaviateClient } from '../weaviate/client';
import type { ChangelogEntry, ChangelogIngestionResult, ParsedChangelog } from './types';
import { parseChangelog, parseChangelogFile } from './parser';

const LOG_PREFIX = '[ChangelogIngestion]';
const CHANGELOG_COLLECTION = 'ChangelogEntry';

/**
 * Weaviate changelog object (stored format)
 */
interface WeaviateChangelogEntry {
  version: string;
  date: string | null;
  type: string;
  title: string;
  description: string;
  issueNumber: string | null;
  commitHash: string | null;
  createdAt: string;
}

/**
 * Initialize ChangelogEntry collection in Weaviate
 */
export async function initializeChangelogSchema(): Promise<void> {
  const client = await getWeaviateClient();

  console.log(`${LOG_PREFIX} Initializing ChangelogEntry schema...`);

  try {
    const exists = await client.collections.exists(CHANGELOG_COLLECTION);

    if (exists) {
      console.log(`${LOG_PREFIX} ChangelogEntry collection already exists`);
      return;
    }

    await client.collections.create({
      name: CHANGELOG_COLLECTION,
      description: 'Changelog entries for RAG retrieval',
      properties: [
        { name: 'version', dataType: 'text', description: 'Semantic version or Unreleased' },
        { name: 'date', dataType: 'text', description: 'Release date (ISO string or null)' },
        { name: 'type', dataType: 'text', description: 'Change type (added, fixed, etc.)' },
        { name: 'title', dataType: 'text', description: 'Brief change title' },
        { name: 'description', dataType: 'text', description: 'Full searchable description' },
        { name: 'issueNumber', dataType: 'text', description: 'Related issue/PR number' },
        { name: 'commitHash', dataType: 'text', description: 'Related commit hash' },
        { name: 'createdAt', dataType: 'text', description: 'ISO date of ingestion' },
      ],
    });

    console.log(`${LOG_PREFIX} Created ChangelogEntry collection`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create ChangelogEntry collection:`, error);
    throw error;
  }
}

/**
 * Clear all existing changelog entries
 */
export async function clearChangelogEntries(): Promise<number> {
  const client = await getWeaviateClient();

  try {
    const exists = await client.collections.exists(CHANGELOG_COLLECTION);
    if (!exists) {
      console.log(`${LOG_PREFIX} ChangelogEntry collection does not exist`);
      return 0;
    }

    const collection = client.collections.get(CHANGELOG_COLLECTION);

    // Fetch and count existing entries
    const result = await collection.query.fetchObjects({ limit: 10000 });
    const count = result.objects.length;

    if (count === 0) {
      console.log(`${LOG_PREFIX} No existing entries to clear`);
      return 0;
    }

    // Delete the collection and recreate it (fastest way to clear)
    await client.collections.delete(CHANGELOG_COLLECTION);
    await initializeChangelogSchema();

    console.log(`${LOG_PREFIX} Cleared ${count} existing changelog entries`);
    return count;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to clear changelog entries:`, error);
    throw error;
  }
}

/**
 * Store changelog entries in Weaviate
 */
export async function storeChangelogEntries(entries: ChangelogEntry[]): Promise<number> {
  if (entries.length === 0) {
    console.log(`${LOG_PREFIX} No entries to store`);
    return 0;
  }

  const client = await getWeaviateClient();
  const collection = client.collections.get(CHANGELOG_COLLECTION);

  const now = new Date().toISOString();

  const objects = entries.map((entry) => ({
    version: entry.version,
    date: entry.date ? entry.date.toISOString() : null,
    type: entry.type,
    title: entry.title,
    description: entry.description,
    issueNumber: entry.issueNumber || null,
    commitHash: entry.commitHash || null,
    createdAt: now,
  }));

  try {
    const result = await collection.data.insertMany(objects);
    const insertedCount = result.uuids ? Object.keys(result.uuids).length : 0;

    console.log(`${LOG_PREFIX} Stored ${insertedCount} changelog entries`);
    return insertedCount;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to store changelog entries:`, error);
    throw error;
  }
}

/**
 * Ingest changelog from parsed content
 */
export async function ingestChangelog(
  parsed: ParsedChangelog,
  options?: { clearExisting?: boolean }
): Promise<ChangelogIngestionResult> {
  const errors: string[] = [];
  let entriesStored = 0;

  try {
    // Initialize schema if needed
    await initializeChangelogSchema();

    // Clear existing entries if requested
    if (options?.clearExisting) {
      await clearChangelogEntries();
    }

    // Store entries
    entriesStored = await storeChangelogEntries(parsed.entries);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMsg);
    console.error(`${LOG_PREFIX} Ingestion error:`, error);
  }

  return {
    entriesProcessed: parsed.entries.length,
    entriesStored,
    errors,
    storedAt: new Date(),
  };
}

/**
 * Ingest changelog from raw markdown content
 */
export async function ingestChangelogContent(
  content: string,
  options?: { clearExisting?: boolean }
): Promise<ChangelogIngestionResult> {
  const parsed = parseChangelog(content);
  return ingestChangelog(parsed, options);
}

/**
 * Ingest changelog from file path
 */
export async function ingestChangelogFile(
  filePath: string,
  options?: { clearExisting?: boolean }
): Promise<ChangelogIngestionResult> {
  const parsed = await parseChangelogFile(filePath);
  return ingestChangelog(parsed, options);
}

/**
 * Convert Weaviate object to ChangelogEntry
 */
function weaviateToChangelogEntry(obj: any): ChangelogEntry {
  const props = obj.properties as WeaviateChangelogEntry;
  return {
    version: props.version,
    date: props.date ? new Date(props.date) : null,
    type: props.type as ChangelogEntry['type'],
    title: props.title,
    description: props.description,
    issueNumber: props.issueNumber || undefined,
    commitHash: props.commitHash || undefined,
  };
}

/**
 * Search changelog entries
 */
export async function searchChangelogEntries(
  query: string,
  options?: { limit?: number; type?: string }
): Promise<ChangelogEntry[]> {
  const client = await getWeaviateClient();

  try {
    const exists = await client.collections.exists(CHANGELOG_COLLECTION);
    if (!exists) {
      console.log(`${LOG_PREFIX} ChangelogEntry collection does not exist`);
      return [];
    }

    const collection = client.collections.get(CHANGELOG_COLLECTION);

    const result = await collection.query.bm25(query, {
      limit: options?.limit || 10,
      returnMetadata: ['score'],
    });

    const entries: ChangelogEntry[] = result.objects
      .filter((obj: any) => {
        const props = obj.properties as WeaviateChangelogEntry;
        if (options?.type && props.type !== options.type) {
          return false;
        }
        return true;
      })
      .map(weaviateToChangelogEntry);

    console.log(`${LOG_PREFIX} Found ${entries.length} changelog entries for "${query}"`);
    return entries;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to search changelog entries:`, error);
    return [];
  }
}

/**
 * Get all changelog entries (for debugging/admin)
 */
export async function getAllChangelogEntries(): Promise<ChangelogEntry[]> {
  const client = await getWeaviateClient();

  try {
    const exists = await client.collections.exists(CHANGELOG_COLLECTION);
    if (!exists) {
      return [];
    }

    const collection = client.collections.get(CHANGELOG_COLLECTION);
    const result = await collection.query.fetchObjects({ limit: 1000 });

    return result.objects.map(weaviateToChangelogEntry);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get all changelog entries:`, error);
    return [];
  }
}
