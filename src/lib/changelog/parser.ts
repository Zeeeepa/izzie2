/**
 * Changelog Parser
 *
 * Parses CHANGELOG.md files following Keep a Changelog format.
 * Extracts structured entries for ingestion into the knowledge base.
 */

import type { ChangelogEntry, ChangelogType, ParsedChangelog } from './types';

const LOG_PREFIX = '[ChangelogParser]';

/**
 * Map section headers to ChangelogType
 */
const SECTION_TYPE_MAP: Record<string, ChangelogType> = {
  'added': 'added',
  'changed': 'changed',
  'deprecated': 'deprecated',
  'removed': 'removed',
  'fixed': 'fixed',
  'security': 'security',
  'documentation': 'documentation',
};

/**
 * Parse version header (e.g., "## [1.0.4] - 2024-01-15" or "## [Unreleased]")
 */
function parseVersionHeader(line: string): { version: string; date: Date | null } | null {
  // Match: ## [version] - YYYY-MM-DD or ## [Unreleased]
  const versionMatch = line.match(/^##\s*\[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/);
  if (!versionMatch) return null;

  const version = versionMatch[1];
  const dateStr = versionMatch[2];

  return {
    version,
    date: dateStr ? new Date(dateStr) : null,
  };
}

/**
 * Parse section header (e.g., "### Added", "### Fixed")
 */
function parseSectionHeader(line: string): ChangelogType | null {
  const match = line.match(/^###\s*(\w+)/i);
  if (!match) return null;

  const type = match[1].toLowerCase();
  return SECTION_TYPE_MAP[type] || null;
}

/**
 * Parse a single entry line (e.g., "- add feature X (#123)")
 */
function parseEntryLine(line: string): {
  title: string;
  issueNumber?: string;
  commitHash?: string;
} | null {
  // Remove leading "- " or "* "
  const trimmed = line.replace(/^[-*]\s*/, '').trim();
  if (!trimmed) return null;

  // Extract issue/PR number (e.g., "(#123)" or "#123")
  const issueMatch = trimmed.match(/\(?#(\d+)\)?/);
  const issueNumber = issueMatch ? `#${issueMatch[1]}` : undefined;

  // Extract commit hash (e.g., "[abc123]" or "(abc123)")
  const commitMatch = trimmed.match(/[\[(]([a-f0-9]{7,40})[\])]/i);
  const commitHash = commitMatch ? commitMatch[1] : undefined;

  // Clean title by removing issue/commit references
  let title = trimmed
    .replace(/\s*\(?#\d+\)?\s*/g, ' ')
    .replace(/\s*[\[(][a-f0-9]{7,40}[\])]\s*/gi, ' ')
    .replace(/\s*\[``\]\([^)]*\)\s*/g, ' ')
    .trim();

  return { title, issueNumber, commitHash };
}

/**
 * Parse changelog content into structured entries
 */
export function parseChangelog(content: string): ParsedChangelog {
  const lines = content.split('\n');
  const entries: ChangelogEntry[] = [];

  let currentVersion: string | null = null;
  let currentDate: Date | null = null;
  let currentType: ChangelogType | null = null;

  console.log(`${LOG_PREFIX} Parsing changelog (${lines.length} lines)`);

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and title
    if (!trimmedLine || trimmedLine.startsWith('# ')) continue;

    // Check for version header
    const versionInfo = parseVersionHeader(trimmedLine);
    if (versionInfo) {
      currentVersion = versionInfo.version;
      currentDate = versionInfo.date;
      currentType = null;
      continue;
    }

    // Check for section header
    const sectionType = parseSectionHeader(trimmedLine);
    if (sectionType) {
      currentType = sectionType;
      continue;
    }

    // Check for entry line
    if ((trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) && currentVersion && currentType) {
      const entryInfo = parseEntryLine(trimmedLine);
      if (entryInfo && entryInfo.title) {
        entries.push({
          version: currentVersion,
          date: currentDate,
          type: currentType,
          title: entryInfo.title,
          description: buildDescription(currentVersion, currentDate, currentType, entryInfo.title),
          issueNumber: entryInfo.issueNumber,
          commitHash: entryInfo.commitHash,
        });
      }
    }
  }

  console.log(`${LOG_PREFIX} Parsed ${entries.length} changelog entries`);

  return {
    entries,
    rawContent: content,
    parsedAt: new Date(),
  };
}

/**
 * Build a searchable description for the entry
 */
function buildDescription(
  version: string,
  date: Date | null,
  type: ChangelogType,
  title: string
): string {
  const dateStr = date ? ` on ${date.toISOString().split('T')[0]}` : '';
  const versionStr = version === 'Unreleased' ? 'in an upcoming release' : `in version ${version}`;

  // Build a natural language description that's searchable
  const typeDescriptions: Record<ChangelogType, string> = {
    added: 'New feature added',
    changed: 'Functionality changed',
    deprecated: 'Feature deprecated',
    removed: 'Feature removed',
    fixed: 'Bug fixed',
    security: 'Security update',
    documentation: 'Documentation update',
  };

  return `${typeDescriptions[type]} ${versionStr}${dateStr}: ${title}`;
}

/**
 * Parse changelog from file path
 */
export async function parseChangelogFile(filePath: string): Promise<ParsedChangelog> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  return parseChangelog(content);
}
