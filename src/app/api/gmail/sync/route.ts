/**
 * Gmail Sync API Endpoint
 * Triggers email synchronization from Gmail using service account
 *
 * SECURITY: Requires authentication. The userEmail is taken from the
 * authenticated session, not from the request body, to prevent attackers
 * from triggering syncs for other users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getServiceAccountAuth } from '@/lib/google/auth';
import { getGmailService } from '@/lib/google/gmail';
import type { SyncStatus } from '@/lib/google/types';
import { inngest } from '@/lib/events';
import type { EmailContentExtractedPayload } from '@/lib/events/types';

// In-memory sync status (in production, use Redis or database)
let syncStatus: SyncStatus & { eventsSent?: number } = {
  isRunning: false,
  emailsProcessed: 0,
  eventsSent: 0,
};

/**
 * POST /api/gmail/sync
 * Start email synchronization
 *
 * SECURITY FIX: Now requires authentication and uses the authenticated
 * user's email instead of accepting userEmail from request body.
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authentication
    const session = await requireAuth(request);
    const userEmail = session.user.email;

    if (!userEmail) {
      return NextResponse.json(
        { error: 'User email not found in session' },
        { status: 400 }
      );
    }

    console.log('[Gmail Sync] Authenticated user:', session.user.id, userEmail);

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
    const {
      folder = 'sent', // Default to SENT emails (user's own communications)
      maxResults = 100,
      since,
      // SECURITY: userEmail from body is IGNORED - we use session.user.email
    } = body;

    // Validate folder
    if (!['inbox', 'sent', 'all'].includes(folder)) {
      return NextResponse.json(
        { error: 'Invalid folder. Must be: inbox, sent, or all' },
        { status: 400 }
      );
    }

    // Start sync (don't await - run in background)
    // SECURITY: Use authenticated user's email, not request body
    startSync(folder, maxResults, since, userEmail).catch((error) => {
      console.error('[Gmail Sync] Background sync failed:', error);
      syncStatus.isRunning = false;
      syncStatus.error = error.message;
    });

    return NextResponse.json({
      message: 'Sync started',
      userId: session.user.id,
      userEmail,
      status: syncStatus,
    });
  } catch (error) {
    console.error('[Gmail Sync] Failed to start sync:', error);

    // Handle authentication errors
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: `Failed to start sync: ${error}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gmail/sync
 * Get sync status
 *
 * SECURITY: Requires authentication to view sync status
 */
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authentication
    const session = await requireAuth(request);

    return NextResponse.json({
      status: syncStatus,
      userId: session.user.id,
    });
  } catch (error) {
    // Handle authentication errors
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}

/**
 * Background sync function
 */
async function startSync(
  folder: string,
  maxResults: number,
  since?: string,
  userEmail?: string
): Promise<void> {
  syncStatus = {
    isRunning: true,
    emailsProcessed: 0,
    eventsSent: 0,
    lastSync: new Date(),
  };

  try {
    // Get authentication
    const auth = await getServiceAccountAuth(userEmail);
    const gmailService = await getGmailService(auth);

    // Parse since date if provided
    const sinceDate = since ? new Date(since) : undefined;

    // Fetch emails with pagination
    let pageToken: string | undefined;
    let totalProcessed = 0;

    do {
      const batch = await gmailService.fetchEmails({
        folder: folder as 'inbox' | 'sent' | 'all',
        maxResults: Math.min(maxResults - totalProcessed, 100),
        pageToken,
        since: sinceDate,
      });

      totalProcessed += batch.emails.length;
      syncStatus.emailsProcessed = totalProcessed;

      // Emit events for entity extraction (batch send for efficiency)
      if (batch.emails.length > 0) {
        const events = batch.emails.map((email) => ({
          name: 'izzie/ingestion.email.extracted' as const,
          data: {
            userId: userEmail || 'default',
            emailId: email.id,
            subject: email.subject,
            body: email.body,
            from: {
              name: email.from.name,
              email: email.from.email,
            },
            to: email.to.map((addr) => ({
              name: addr.name,
              email: addr.email,
            })),
            date: email.date.toISOString(),
            threadId: email.threadId,
            labels: email.labels,
            snippet: email.snippet,
          } satisfies EmailContentExtractedPayload,
        }));

        await inngest.send(events);
        syncStatus.eventsSent = (syncStatus.eventsSent || 0) + events.length;
        console.log(`[Gmail Sync] Sent ${events.length} events for entity extraction`);
      }

      // Log sent emails (high-signal for significance)
      const sentEmails = batch.emails.filter((email) => email.isSent);
      if (sentEmails.length > 0) {
        console.log(`[Gmail Sync] Found ${sentEmails.length} sent emails (high-signal)`);
      }

      pageToken = batch.nextPageToken;

      // Stop if we've reached max results
      if (totalProcessed >= maxResults) {
        break;
      }
    } while (pageToken);

    syncStatus.isRunning = false;
    syncStatus.lastSync = new Date();
    console.log(
      `[Gmail Sync] Completed. Processed ${totalProcessed} emails, sent ${syncStatus.eventsSent} events for extraction`
    );
  } catch (error) {
    console.error('[Gmail Sync] Sync failed:', error);
    syncStatus.isRunning = false;
    syncStatus.error = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  }
}
