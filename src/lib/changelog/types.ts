/**
 * Changelog Types
 *
 * Defines types for changelog parsing and storage.
 * Used for ingesting changelog entries into the RAG knowledge base.
 */

/**
 * Changelog entry type (Keep a Changelog categories)
 */
export type ChangelogType =
  | 'added'      // New features
  | 'changed'    // Changes in existing functionality
  | 'deprecated' // Soon-to-be removed features
  | 'removed'    // Now removed features
  | 'fixed'      // Bug fixes
  | 'security'   // Security vulnerabilities
  | 'documentation'; // Documentation updates

/**
 * Single changelog entry
 */
export interface ChangelogEntry {
  version: string;        // Semantic version (e.g., "1.0.4") or "Unreleased"
  date: Date | null;      // Release date (null for Unreleased)
  type: ChangelogType;    // Category of change
  title: string;          // Brief title/summary
  description: string;    // Full description of the change
  issueNumber?: string;   // Related issue/PR number (e.g., "#58")
  commitHash?: string;    // Related commit hash
}

/**
 * Parsed changelog
 */
export interface ParsedChangelog {
  entries: ChangelogEntry[];
  rawContent: string;
  parsedAt: Date;
}

/**
 * Ingestion result
 */
export interface ChangelogIngestionResult {
  entriesProcessed: number;
  entriesStored: number;
  errors: string[];
  storedAt: Date;
}
