/**
 * Google Drive Sync API Endpoint
 * Triggers Drive document synchronization and entity extraction
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceAccountAuth } from '@/lib/google/auth';
import { getDriveService } from '@/lib/google/drive';
import type { SyncStatus } from '@/lib/google/types';
import { inngest } from '@/lib/events';
import type { DriveContentExtractedPayload } from '@/lib/events/types';
import {
  updateCounters,
  completeExtraction,
  markExtractionError,
} from '@/lib/extraction/progress';

// Supported MIME types for entity extraction
const SUPPORTED_MIME_TYPES = [
  'application/vnd.google-apps.document', // Google Docs
  'application/vnd.google-apps.spreadsheet', // Google Sheets
  'application/vnd.google-apps.presentation', // Google Slides
  'text/plain', // Plain text files
  'application/pdf', // PDF files (if readable)
];

// In-memory sync status (in production, use Redis or database)
let syncStatus: SyncStatus & { filesProcessed?: number } = {
  isRunning: false,
  emailsProcessed: 0,
  filesProcessed: 0,
};

/**
 * POST /api/drive/sync
 * Start Drive document synchronization
 */
export async function POST(request: NextRequest) {
  try {
    // Check if sync is already running
    if (syncStatus.isRunning) {
      return NextResponse.json(
        {
          error: 'Sync already in progress',
          status: syncStatus,
        },
        { status: 409 }
      );
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { maxResults = 100, daysSince = 30, userEmail } = body;

    // Start sync (don't await - run in background)
    startSync(maxResults, daysSince, userEmail).catch((error) => {
      console.error('[Drive Sync] Background sync failed:', error);
      syncStatus.isRunning = false;
      syncStatus.error = error.message;
    });

    return NextResponse.json({
      message: 'Drive sync started',
      status: syncStatus,
    });
  } catch (error) {
    console.error('[Drive Sync] Failed to start sync:', error);
    return NextResponse.json({ error: `Failed to start sync: ${error}` }, { status: 500 });
  }
}

/**
 * GET /api/drive/sync
 * Get sync status
 */
export async function GET() {
  return NextResponse.json({
    status: syncStatus,
  });
}

/**
 * Background sync function
 */
async function startSync(
  maxResults: number,
  daysSince: number,
  userEmail?: string
): Promise<void> {
  syncStatus = {
    isRunning: true,
    emailsProcessed: 0,
    filesProcessed: 0,
    lastSync: new Date(),
  };

  const userId = userEmail || process.env.DEFAULT_USER_ID || 'default';

  try {
    // Get authentication
    const auth = await getServiceAccountAuth(userEmail);
    const driveService = await getDriveService(auth);

    // Calculate time range
    const since = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000);
    const sinceISO = since.toISOString();

    // Build query to filter files
    const mimeConditions = SUPPORTED_MIME_TYPES.map((type) => `mimeType='${type}'`);
    const query = [
      `(${mimeConditions.join(' or ')})`,
      `modifiedTime > '${sinceISO}'`,
      'trashed = false',
    ].join(' and ');

    console.log(`[Drive Sync] Fetching files modified since ${sinceISO}`);
    console.log(`[Drive Sync] Query: ${query}`);

    // Fetch Drive files with pagination
    let pageToken: string | undefined;
    let totalProcessed = 0;

    do {
      const batch = await driveService.listFiles({
        query,
        maxResults: Math.min(maxResults - totalProcessed, 100),
        orderBy: 'modifiedTime desc',
        pageToken,
      });

      totalProcessed += batch.files.length;
      syncStatus.filesProcessed = totalProcessed;

      // Update extraction progress table
      await updateCounters(userId, 'drive', {
        totalItems: totalProcessed,
        processedItems: totalProcessed,
      });

      // Process each file and emit events
      for (const file of batch.files) {
        try {
          // Skip trashed files (double-check)
          if (file.trashed) {
            console.log(`[Drive Sync] Skipping trashed file: ${file.name}`);
            continue;
          }

          // Fetch file content
          const fileContent = await driveService.getFileContent(file.id);
          const content =
            typeof fileContent.content === 'string'
              ? fileContent.content
              : fileContent.content.toString('utf-8');

          // Emit event for entity extraction
          await inngest.send({
            name: 'izzie/ingestion.drive.extracted',
            data: {
              userId,
              fileId: file.id,
              fileName: file.name,
              mimeType: file.mimeType,
              content,
              modifiedTime: file.modifiedTime.toISOString(),
              owners: file.owners.map((owner) => ({
                displayName: owner.displayName,
                emailAddress: owner.emailAddress,
              })),
            } satisfies DriveContentExtractedPayload,
          });

          console.log(`[Drive Sync] Emitted event for file: ${file.name} (${file.id})`);
        } catch (error) {
          console.error(`[Drive Sync] Failed to process file ${file.id}:`, error);
          // Continue with other files
        }
      }

      pageToken = batch.nextPageToken;

      // Stop if we've reached max results
      if (totalProcessed >= maxResults) {
        break;
      }
    } while (pageToken);

    syncStatus.isRunning = false;
    syncStatus.lastSync = new Date();

    // Mark extraction as completed in database
    await completeExtraction(userId, 'drive', {
      oldestDate: since,
      newestDate: new Date(),
    });

    console.log(
      `[Drive Sync] Completed. Processed ${totalProcessed} files, emitted ${totalProcessed} events for extraction`
    );
  } catch (error) {
    console.error('[Drive Sync] Sync failed:', error);
    syncStatus.isRunning = false;
    syncStatus.error = error instanceof Error ? error.message : 'Unknown error';

    // Mark extraction as error in database
    await markExtractionError(userId, 'drive');

    throw error;
  }
}
