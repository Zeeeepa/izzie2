/**
 * Google Drive Chat Tools
 * MCP tools for interacting with Google Drive API
 */

import { z } from 'zod';
import { google } from 'googleapis';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { DriveService } from '@/lib/google/drive';
import type { DriveFile, DriveFileContent } from '@/lib/google/types';

const LOG_PREFIX = '[Drive Tools]';

/**
 * Initialize Drive client for user
 */
async function getDriveClient(userId: string): Promise<DriveService> {
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

  return new DriveService(oauth2Client);
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
  exportFormat: z
    .enum(['text', 'markdown', 'html', 'pdf'])
    .optional()
    .describe('Optional: Export format for Google Docs (text, markdown, html, pdf). Default: text for Docs, CSV for Sheets.'),
});

export type GetDriveFileContentParams = z.infer<typeof getDriveFileContentToolSchema>;

export const getDriveFileContentTool = {
  name: 'get_drive_file_content',
  description: 'Retrieve the content of a Google Drive file. Supports Google Docs, Sheets, Slides (exported as text), and binary files (returns download link).',
  parameters: getDriveFileContentToolSchema,
  async execute(params: GetDriveFileContentParams, userId: string): Promise<{ message: string }> {
    console.log(`${LOG_PREFIX} Getting drive file content for user ${userId}`, params);

    const validated = getDriveFileContentToolSchema.parse(params);

    const driveClient = await getDriveClient(userId);

    const fileContent: DriveFileContent = await driveClient.getFileContent(validated.fileId);
    const { file, content, mimeType } = fileContent;

    console.log(`${LOG_PREFIX} Retrieved file content: ${file.name} (${mimeType})`);

    const lines: string[] = [];
    const emoji = getFileTypeEmoji(file.mimeType);

    lines.push(`${emoji} **${file.name}**`);
    lines.push(`   ID: ${file.id}`);
    lines.push(`   Type: ${mimeType}`);

    // If content is a Buffer (binary file), provide download link
    if (Buffer.isBuffer(content)) {
      lines.push(`   📏 Size: ${formatFileSize(file.size)}`);
      if (file.webContentLink) {
        lines.push(`\n📥 **Download Link:**\n${file.webContentLink}`);
      } else if (file.webViewLink) {
        lines.push(`\n🔗 **View Link:**\n${file.webViewLink}`);
      } else {
        lines.push(`\n⚠️ Binary file content cannot be displayed directly. Please use the Drive API to download.`);
      }
    } else {
      // Text content
      const textContent = content as string;
      const preview = textContent.length > 2000
        ? textContent.substring(0, 1997) + '...'
        : textContent;

      lines.push(`   📏 Size: ${textContent.length} characters`);
      lines.push(`\n📄 **Content:**\n\`\`\`\n${preview}\n\`\`\``);

      if (textContent.length > 2000) {
        lines.push(`\n💡 Content truncated to 2000 characters. Full file has ${textContent.length} characters.`);
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
