/**
 * Google Drive Chat Tools
 * MCP tools for interacting with Google Drive API
 */

import { z } from 'zod';
import { google } from 'googleapis';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { DriveService } from '@/lib/google/drive';
import { DocsService } from '@/lib/google/docs';
import { SheetsService } from '@/lib/google/sheets';
import type {
  DriveFile,
  DriveFileContent,
  GoogleDocStructured,
  GoogleSheetStructured,
} from '@/lib/google/types';

const LOG_PREFIX = '[Drive Tools]';

// MIME types for Google Workspace files
const GOOGLE_MIME_TYPES = {
  DOCUMENT: 'application/vnd.google-apps.document',
  SPREADSHEET: 'application/vnd.google-apps.spreadsheet',
} as const;

/**
 * Get OAuth2 client for user
 */
async function getOAuth2Client(userId: string) {
  const tokens = await getGoogleTokens(userId);
  if (!tokens) {
    throw new Error('No Google tokens found for user. Please connect your Google account.');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
      : 'http://localhost:3300/api/auth/callback/google'
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken || undefined,
    refresh_token: tokens.refreshToken || undefined,
    expiry_date: tokens.accessTokenExpiresAt
      ? new Date(tokens.accessTokenExpiresAt).getTime()
      : undefined,
  });

  // Auto-refresh tokens if needed
  oauth2Client.on('tokens', async (newTokens) => {
    console.log(`${LOG_PREFIX} Tokens refreshed for user:`, userId);
    await updateGoogleTokens(userId, newTokens);
  });

  return oauth2Client;
}

/**
 * Initialize Drive client for user
 */
async function getDriveClient(userId: string): Promise<DriveService> {
  const oauth2Client = await getOAuth2Client(userId);
  return new DriveService(oauth2Client);
}

/**
 * Initialize Docs client for user
 */
async function getDocsClient(userId: string): Promise<DocsService> {
  const oauth2Client = await getOAuth2Client(userId);
  return new DocsService(oauth2Client);
}

/**
 * Initialize Sheets client for user
 */
async function getSheetsClient(userId: string): Promise<SheetsService> {
  const oauth2Client = await getOAuth2Client(userId);
  return new SheetsService(oauth2Client);
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Get file type emoji
 */
function getFileTypeEmoji(mimeType: string): string {
  if (mimeType.includes('folder')) return '📁';
  if (mimeType.includes('document')) return '📄';
  if (mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('presentation')) return '📽️';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('image')) return '🖼️';
  if (mimeType.includes('video')) return '🎬';
  if (mimeType.includes('audio')) return '🎵';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '📦';
  return '📎';
}

/**
 * Format Drive file for user-friendly display
 */
function formatFile(file: DriveFile, includeContent = false): string {
  const lines: string[] = [];
  const emoji = getFileTypeEmoji(file.mimeType);

  lines.push(`${emoji} **${file.name}**`);
  lines.push(`   ID: ${file.id}`);

  // File size
  if (file.size !== undefined) {
    lines.push(`   📏 Size: ${formatFileSize(file.size)}`);
  }

  // Modified time
  lines.push(`   🕐 Modified: ${file.modifiedTime.toLocaleString()}`);

  // Owner
  if (file.owners && file.owners.length > 0) {
    const owner = file.owners[0];
    lines.push(`   👤 Owner: ${owner.displayName || owner.emailAddress}`);
  }

  // Shared status
  if (file.shared) {
    lines.push(`   🔗 Shared`);
  }

  // Starred status
  if (file.starred) {
    lines.push(`   ⭐ Starred`);
  }

  // Description
  if (file.description) {
    const truncatedDesc = file.description.length > 100
      ? file.description.substring(0, 97) + '...'
      : file.description;
    lines.push(`   📝 ${truncatedDesc}`);
  }

  // Links
  if (file.webViewLink) {
    lines.push(`   🔗 View: ${file.webViewLink}`);
  }

  return lines.join('\n');
}

/**
 * Format multiple files for display
 */
function formatFilesList(files: DriveFile[]): string {
  if (files.length === 0) {
    return '📁 No files found.';
  }

  const formattedFiles = files.map(file => formatFile(file)).join('\n\n');
  return `📁 Found ${files.length} file(s):\n\n${formattedFiles}`;
}

// ===== SEARCH DRIVE FILES TOOL =====

export const searchDriveFilesToolSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Search query to find files by name or content (e.g., "project proposal", "meeting notes").'),
  fileTypes: z
    .array(z.string())
    .optional()
    .describe('Optional: Filter by MIME types (e.g., ["application/pdf", "application/vnd.google-apps.document"]).'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .describe('Maximum number of files to return (1-100). Default: 10.'),
  orderBy: z
    .string()
    .optional()
    .default('modifiedTime desc')
    .describe('Sort order (e.g., "modifiedTime desc", "name", "createdTime desc"). Default: "modifiedTime desc".'),
});

export type SearchDriveFilesParams = z.infer<typeof searchDriveFilesToolSchema>;

export const searchDriveFilesTool = {
  name: 'search_drive_files',
  description: 'Search Google Drive files by name or content with optional filtering by file type and sorting.',
  parameters: searchDriveFilesToolSchema,
  async execute(params: SearchDriveFilesParams, userId: string): Promise<{ message: string }> {
    console.log(`${LOG_PREFIX} Searching drive files for user ${userId}`, params);

    const validated = searchDriveFilesToolSchema.parse(params);

    const driveClient = await getDriveClient(userId);

    const result = await driveClient.searchFiles({
      query: validated.query,
      maxResults: validated.maxResults,
      orderBy: validated.orderBy,
      includeSharedDrives: true,
    });

    let files = result.files;

    // Apply MIME type filtering if provided
    if (validated.fileTypes && validated.fileTypes.length > 0) {
      files = files.filter(file => validated.fileTypes!.includes(file.mimeType));
    }

    console.log(`${LOG_PREFIX} Found ${files.length} files matching query: "${validated.query}"`);

    if (files.length === 0) {
      return {
        message: `🔍 No files found matching "${validated.query}".`,
      };
    }

    return {
      message: `🔍 Search results for "${validated.query}":\n\n${formatFilesList(files)}`,
    };
  },
};

// ===== GET DRIVE FILE CONTENT TOOL =====

export const getDriveFileContentToolSchema = z.object({
  fileId: z
    .string()
    .min(1)
    .describe('The unique ID of the Google Drive file to retrieve content from.'),
  structured: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Optional: Return structured content for Google Docs/Sheets (preserves formatting, headings, tables). Default: true.'
    ),
  exportFormat: z
    .enum(['text', 'markdown', 'html', 'pdf'])
    .optional()
    .describe(
      'Optional: Export format for Google Docs (text, markdown, html, pdf). Only used when structured=false. Default: text for Docs, CSV for Sheets.'
    ),
});

export type GetDriveFileContentParams = z.infer<typeof getDriveFileContentToolSchema>;

export const getDriveFileContentTool = {
  name: 'get_drive_file_content',
  description:
    'Retrieve the content of a Google Drive file. For Google Docs/Sheets, returns structured content by default (preserves formatting, headings, tables). For other files, returns plain text or download link.',
  parameters: getDriveFileContentToolSchema,
  async execute(params: GetDriveFileContentParams, userId: string): Promise<{ message: string }> {
    console.log(`${LOG_PREFIX} Getting drive file content for user ${userId}`, params);

    const validated = getDriveFileContentToolSchema.parse(params);

    const driveClient = await getDriveClient(userId);

    // First, get file metadata to determine MIME type
    const file = await driveClient.getFile(validated.fileId);

    console.log(`${LOG_PREFIX} Retrieved file: ${file.name} (${file.mimeType})`);

    const lines: string[] = [];
    const emoji = getFileTypeEmoji(file.mimeType);

    lines.push(`${emoji} **${file.name}**`);
    lines.push(`   ID: ${file.id}`);
    lines.push(`   Type: ${file.mimeType}`);

    // Handle Google Docs with structured content
    if (file.mimeType === GOOGLE_MIME_TYPES.DOCUMENT && validated.structured) {
      const docsClient = await getDocsClient(userId);
      const doc: GoogleDocStructured = await docsClient.getDocument(validated.fileId);

      lines.push(`   📄 Document Structure: ${doc.sections.length} sections`);
      lines.push(`\n📄 **Structured Content:**\n`);

      // Format structured document content
      for (const section of doc.sections) {
        if (section.heading) {
          const headingPrefix = '#'.repeat(section.headingLevel);
          lines.push(`${headingPrefix} ${section.heading}\n`);
        }

        // Add paragraphs
        for (const paragraph of section.paragraphs) {
          let text = paragraph.text;
          if (paragraph.style.bold) text = `**${text}**`;
          if (paragraph.style.italic) text = `*${text}*`;
          if (paragraph.style.underline) text = `__${text}__`;
          lines.push(text);
          lines.push('');
        }

        // Add lists
        for (const list of section.lists) {
          for (const item of list.items) {
            const indent = '  '.repeat(item.nestingLevel);
            const bullet = list.type === 'numbered' ? '1.' : '-';
            lines.push(`${indent}${bullet} ${item.text}`);
          }
          lines.push('');
        }
      }

      if (file.webViewLink) {
        lines.push(`\n🔗 **View in Google Docs:**\n${file.webViewLink}`);
      }
    }
    // Handle Google Sheets with structured content
    else if (file.mimeType === GOOGLE_MIME_TYPES.SPREADSHEET && validated.structured) {
      const sheetsClient = await getSheetsClient(userId);
      const spreadsheet: GoogleSheetStructured = await sheetsClient.getSpreadsheet(
        validated.fileId
      );

      lines.push(`   📊 Sheets: ${spreadsheet.sheets.length} tabs`);
      lines.push(`\n📊 **Structured Content:**\n`);

      // Format structured spreadsheet content
      for (const sheet of spreadsheet.sheets) {
        lines.push(`## ${sheet.name}`);
        lines.push(
          `   Dimensions: ${sheet.metadata.rowCount} rows × ${sheet.metadata.columnCount} columns\n`
        );

        // Show headers
        if (sheet.headers.length > 0) {
          lines.push(`**Headers:** ${sheet.headers.join(' | ')}`);
          lines.push('');
        }

        // Show first 10 rows of data
        const rowsToShow = sheet.rows.slice(0, 10);
        if (rowsToShow.length > 0) {
          lines.push(`**Data (first ${rowsToShow.length} rows):**`);
          for (const row of rowsToShow) {
            lines.push(`- ${row.join(' | ')}`);
          }

          if (sheet.rows.length > 10) {
            lines.push(`\n   ... and ${sheet.rows.length - 10} more rows`);
          }
        }

        lines.push('');
      }

      if (file.webViewLink) {
        lines.push(`\n🔗 **View in Google Sheets:**\n${file.webViewLink}`);
      }
    }
    // Handle other files or non-structured export
    else {
      const fileContent: DriveFileContent = await driveClient.getFileContent(validated.fileId);
      const { content, mimeType } = fileContent;

      lines.push(`   Content Type: ${mimeType}`);

      // If content is a Buffer (binary file), provide download link
      if (Buffer.isBuffer(content)) {
        lines.push(`   📏 Size: ${formatFileSize(file.size)}`);
        if (file.webContentLink) {
          lines.push(`\n📥 **Download Link:**\n${file.webContentLink}`);
        } else if (file.webViewLink) {
          lines.push(`\n🔗 **View Link:**\n${file.webViewLink}`);
        } else {
          lines.push(
            `\n⚠️ Binary file content cannot be displayed directly. Please use the Drive API to download.`
          );
        }
      } else {
        // Text content
        const textContent = content as string;
        const preview =
          textContent.length > 2000 ? textContent.substring(0, 1997) + '...' : textContent;

        lines.push(`   📏 Size: ${textContent.length} characters`);
        lines.push(`\n📄 **Content:**\n\`\`\`\n${preview}\n\`\`\``);

        if (textContent.length > 2000) {
          lines.push(
            `\n💡 Content truncated to 2000 characters. Full file has ${textContent.length} characters.`
          );
        }
      }
    }

    return {
      message: lines.join('\n'),
    };
  },
};

// ===== LIST DRIVE FILES TOOL =====

export const listDriveFilesToolSchema = z.object({
  folderId: z
    .string()
    .optional()
    .describe('Optional: Folder ID to list files from. If not provided, lists files from the root of "My Drive".'),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe('Number of files to return per page (1-100). Default: 20.'),
  orderBy: z
    .string()
    .optional()
    .default('modifiedTime desc')
    .describe('Sort order (e.g., "modifiedTime desc", "name", "createdTime desc"). Default: "modifiedTime desc".'),
});

export type ListDriveFilesParams = z.infer<typeof listDriveFilesToolSchema>;

export const listDriveFilesTool = {
  name: 'list_drive_files',
  description: 'List files from a Google Drive folder (or root) with pagination and sorting options.',
  parameters: listDriveFilesToolSchema,
  async execute(params: ListDriveFilesParams, userId: string): Promise<{ message: string }> {
    console.log(`${LOG_PREFIX} Listing drive files for user ${userId}`, params);

    const validated = listDriveFilesToolSchema.parse(params);

    const driveClient = await getDriveClient(userId);

    // Build query based on folderId
    let query = 'trashed = false';
    if (validated.folderId) {
      query += ` and '${validated.folderId}' in parents`;
    } else {
      // List files in root (not in any specific folder)
      query += ` and 'root' in parents`;
    }

    const result = await driveClient.listFiles({
      query,
      maxResults: validated.pageSize,
      orderBy: validated.orderBy,
      includeItemsFromAllDrives: false,
      supportsAllDrives: false,
    });

    console.log(`${LOG_PREFIX} Found ${result.files.length} files`);

    if (result.files.length === 0) {
      return {
        message: validated.folderId
          ? `📁 No files found in folder (ID: ${validated.folderId}).`
          : `📁 No files found in your Drive root.`,
      };
    }

    const folderInfo = validated.folderId
      ? `in folder (ID: ${validated.folderId})`
      : 'in your Drive root';

    return {
      message: `📁 Files ${folderInfo}:\n\n${formatFilesList(result.files)}`,
    };
  },
};
