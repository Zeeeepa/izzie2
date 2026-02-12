/**
 * Drive Source for Research Agent
 * Searches Google Drive files using DriveService
 */

import { DriveService } from '@/lib/google/drive';
import type { Auth } from 'googleapis';
import type { ResearchSourceResult } from '../types';
import type { DriveFile, DriveFileContent } from '@/lib/google/types';

const MAX_RESULTS_DEFAULT = 5;

/**
 * Common stop words to filter out from search queries
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'that',
  'the',
  'to',
  'was',
  'will',
  'with',
]);

/**
 * Extract meaningful keywords from a query string
 * Filters out stop words and short words
 */
function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^\w]/g, '')) // Remove punctuation
    .filter((word) => word.length > 2) // Keep words longer than 2 chars
    .filter((word) => !STOP_WORDS.has(word)); // Remove stop words
}

/**
 * Build Drive API query from keywords
 * Searches in both fullText and name fields with OR operator
 */
function buildDriveQuery(keywords: string[]): string {
  if (keywords.length === 0) {
    return ''; // Empty query will be handled by caller
  }

  // Escape single quotes for Drive API
  const escapedKeywords = keywords.map((kw) => kw.replace(/'/g, "\\'"));

  // Build query: (fullText contains 'keyword' or name contains 'keyword') for each keyword
  const keywordClauses = escapedKeywords.map(
    (kw) => `(fullText contains '${kw}' or name contains '${kw}')`
  );

  return keywordClauses.join(' or ');
}

export interface DriveSearchOptions {
  maxResults?: number;
  includeSharedDrives?: boolean;
  mimeTypes?: string[]; // Filter by specific MIME types
}

/**
 * Search Drive files by query keywords
 * Returns top results with unified ResearchSourceResult format
 */
export async function searchDriveFiles(
  auth: Auth.GoogleAuth | Auth.OAuth2Client,
  query: string,
  options: DriveSearchOptions = {}
): Promise<ResearchSourceResult[]> {
  const {
    maxResults = MAX_RESULTS_DEFAULT,
    includeSharedDrives = false,
  } = options;

  const driveService = new DriveService(auth);

  try {
    // Extract keywords and build Drive API query
    const keywords = extractKeywords(query);
    const driveQuery = buildDriveQuery(keywords);

    // Fallback to exact match if no keywords extracted
    const finalQuery =
      driveQuery.length > 0
        ? driveQuery
        : `(fullText contains '${query.replace(/'/g, "\\'")}' or name contains '${query.replace(/'/g, "\\'")}')`;

    console.log(
      `[DriveSource] Query: "${query}" -> Keywords: [${keywords.join(', ')}]`
    );

    // Use Drive's built-in search which searches name and content
    const batch = await driveService.searchFiles({
      query: finalQuery,
      maxResults,
      includeSharedDrives,
      orderBy: 'relevance',
    });

    // Convert to unified format
    const results: ResearchSourceResult[] = batch.files
      .slice(0, maxResults)
      .map((file) => driveFileToResearchResult(file));

    console.log(
      `[DriveSource] Found ${results.length} files matching "${query}"`
    );

    return results;
  } catch (error) {
    console.error('[DriveSource] Failed to search Drive:', error);
    return [];
  }
}

/**
 * Get content from a Drive file for analysis
 */
export async function getDriveFileContent(
  auth: Auth.GoogleAuth | Auth.OAuth2Client,
  fileId: string
): Promise<DriveFileContent | null> {
  const driveService = new DriveService(auth);

  try {
    const content = await driveService.getFileContent(fileId);
    return content;
  } catch (error) {
    console.error(`[DriveSource] Failed to get content for ${fileId}:`, error);
    return null;
  }
}

/**
 * Convert DriveFile to ResearchSourceResult
 */
function driveFileToResearchResult(file: DriveFile): ResearchSourceResult {
  const ownerName =
    file.owners.length > 0
      ? file.owners[0].displayName || file.owners[0].emailAddress
      : 'Unknown';
  const dateStr = file.modifiedTime.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const fileType = getFileTypeLabel(file.mimeType);

  return {
    sourceType: 'drive',
    title: file.name,
    snippet: file.description || `${fileType} modified ${dateStr}`,
    link: file.id,
    reference: `${fileType} by ${ownerName}, modified ${dateStr}`,
    date: file.modifiedTime,
    metadata: {
      mimeType: file.mimeType,
      size: file.size,
      owners: file.owners,
      webViewLink: file.webViewLink,
      shared: file.shared,
      starred: file.starred,
    },
  };
}

/**
 * Get human-readable file type label
 */
function getFileTypeLabel(mimeType: string): string {
  const mimeTypeLabels: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.folder': 'Folder',
    'application/vnd.google-apps.form': 'Google Form',
    'application/pdf': 'PDF',
    'text/plain': 'Text File',
    'application/json': 'JSON File',
    'image/png': 'PNG Image',
    'image/jpeg': 'JPEG Image',
  };

  return mimeTypeLabels[mimeType] || 'File';
}
