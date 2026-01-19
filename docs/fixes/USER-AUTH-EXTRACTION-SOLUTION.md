# User-Authenticated Email Extraction Solution

## Problem
The batch extraction script fails because it uses service account OAuth, which requires domain-wide delegation. You need a way to trigger email extraction using the logged-in user's OAuth tokens.

## Solution: Two-Step Approach

### Step 1: Sync Emails with User OAuth (Existing Endpoint)
Use `/api/gmail/sync` which already supports user email parameter but still uses service account.

### Step 2: Create New User-Authenticated Endpoint
Create a new endpoint `/api/gmail/sync-user` that mirrors the calendar pattern using `requireAuth()` and user OAuth tokens.

---

## Quick Fix: Modified Gmail Sync Endpoint

### File: `src/app/api/gmail/sync-user/route.ts` (NEW)

Create this new endpoint that follows the calendar pattern:

```typescript
/**
 * User-Authenticated Gmail Sync API Endpoint
 * Syncs emails using the logged-in user's OAuth tokens
 * Requires user to be authenticated via better-auth session
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getGoogleTokens } from '@/lib/auth';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { SyncStatus } from '@/lib/google/types';
import { inngest } from '@/lib/events';
import type { EmailContentExtractedPayload } from '@/lib/events/types';

// In-memory sync status
let syncStatus: SyncStatus & { eventsSent?: number } = {
  isRunning: false,
  emailsProcessed: 0,
  eventsSent: 0,
};

/**
 * Initialize Gmail client with user's OAuth tokens
 */
async function getUserGmailClient(userId: string) {
  try {
    // Get user's Google OAuth tokens from database
    const tokens = await getGoogleTokens(userId);

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
        : 'http://localhost:3300/api/auth/callback/google'
    );

    // Set credentials
    oauth2Client.setCredentials({
      access_token: tokens.accessToken || undefined,
      refresh_token: tokens.refreshToken || undefined,
      expiry_date: tokens.accessTokenExpiresAt
        ? new Date(tokens.accessTokenExpiresAt).getTime()
        : undefined,
    });

    // Auto-refresh tokens
    oauth2Client.on('tokens', async (newTokens) => {
      console.log('[Gmail Sync User] Tokens refreshed for user:', userId);
      // TODO: Update tokens in database (same as calendar)
    });

    // Initialize Gmail API
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    return gmail;
  } catch (error) {
    console.error('[Gmail Sync User] Failed to initialize client:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Failed to initialize Gmail client'
    );
  }
}

/**
 * POST /api/gmail/sync-user
 * Start email synchronization using logged-in user's OAuth tokens
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;
    const userEmail = session.user.email;

    console.log('[Gmail Sync User] User authenticated:', userId, userEmail);

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
      folder = 'sent', // Default to SENT emails
      maxResults = 100,
      since,
    } = body;

    // Validate folder
    if (!['inbox', 'sent', 'all'].includes(folder)) {
      return NextResponse.json(
        { error: 'Invalid folder. Must be: inbox, sent, or all' },
        { status: 400 }
      );
    }

    // Start sync in background
    startUserSync(userId, userEmail!, folder, maxResults, since).catch((error) => {
      console.error('[Gmail Sync User] Background sync failed:', error);
      syncStatus.isRunning = false;
      syncStatus.error = error.message;
    });

    return NextResponse.json({
      message: 'Sync started with user OAuth tokens',
      userId,
      userEmail,
      status: syncStatus,
    });
  } catch (error) {
    console.error('[Gmail Sync User] Failed to start sync:', error);

    let errorMessage = 'Unknown error';
    let errorDetails = '';

    if (error instanceof Error) {
      errorMessage = error.message;

      if (errorMessage.includes('No Google account')) {
        errorDetails = 'No Google account linked. Please sign in with Google OAuth.';
      } else if (errorMessage.includes('Unauthorized')) {
        errorDetails = 'User not authenticated. Please sign in.';
      }
    }

    return NextResponse.json(
      {
        error: `Failed to start sync: ${errorMessage}`,
        details: errorDetails,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gmail/sync-user
 * Get sync status
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);

    return NextResponse.json({
      status: syncStatus,
      userId: session.user.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
}

/**
 * Background sync function using user OAuth tokens
 */
async function startUserSync(
  userId: string,
  userEmail: string,
  folder: string,
  maxResults: number,
  since?: string
): Promise<void> {
  syncStatus = {
    isRunning: true,
    emailsProcessed: 0,
    eventsSent: 0,
    lastSync: new Date(),
  };

  try {
    // Get user's Gmail client
    const gmail = await getUserGmailClient(userId);

    // Parse since date if provided
    const sinceDate = since ? new Date(since) : undefined;

    // Build query
    let query = '';
    if (sinceDate) {
      query += `after:${Math.floor(sinceDate.getTime() / 1000)} `;
    }

    // Add folder filter
    if (folder === 'sent') {
      query += 'in:sent';
    } else if (folder === 'inbox') {
      query += 'in:inbox';
    }
    // 'all' means no label filter

    console.log('[Gmail Sync User] Fetching with query:', query);

    // Fetch emails with pagination
    let pageToken: string | undefined;
    let totalProcessed = 0;

    do {
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: Math.min(maxResults - totalProcessed, 100),
        pageToken,
        q: query || undefined,
      });

      const messages = response.data.messages || [];

      // Fetch full message details and emit events
      for (const message of messages) {
        if (!message.id) continue;

        try {
          // Get full message
          const fullMessage = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full',
          });

          // Parse email data
          const headers = fullMessage.data.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

          const subject = getHeader('Subject');
          const from = getHeader('From');
          const to = getHeader('To');
          const date = getHeader('Date');

          // Extract body (simplified - would need proper MIME parsing)
          let body = '';
          if (fullMessage.data.payload?.body?.data) {
            body = Buffer.from(fullMessage.data.payload.body.data, 'base64').toString('utf-8');
          } else if (fullMessage.data.payload?.parts) {
            // Get first text/plain or text/html part
            const textPart = fullMessage.data.payload.parts.find(
              p => p.mimeType === 'text/plain' || p.mimeType === 'text/html'
            );
            if (textPart?.body?.data) {
              body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
            }
          }

          // Emit event for entity extraction
          await inngest.send({
            name: 'izzie/ingestion.email.extracted',
            data: {
              userId,
              emailId: message.id,
              subject,
              body,
              from: {
                name: from.split('<')[0].trim(),
                email: from.match(/<(.+)>/)?.[1] || from,
              },
              to: to.split(',').map(addr => ({
                name: addr.split('<')[0].trim(),
                email: addr.match(/<(.+)>/)?.[1] || addr,
              })),
              date: new Date(date).toISOString(),
              threadId: fullMessage.data.threadId || message.id,
              labels: fullMessage.data.labelIds || [],
              snippet: fullMessage.data.snippet || '',
            } satisfies EmailContentExtractedPayload,
          });

          totalProcessed++;
          syncStatus.emailsProcessed = totalProcessed;
          syncStatus.eventsSent = (syncStatus.eventsSent || 0) + 1;

          console.log(`[Gmail Sync User] Processed ${totalProcessed}/${maxResults}: ${subject}`);

          // Small delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          console.error(`[Gmail Sync User] Error processing message ${message.id}:`, error);
          // Continue with other emails
        }

        // Stop if we've reached max results
        if (totalProcessed >= maxResults) {
          break;
        }
      }

      pageToken = response.data.nextPageToken || undefined;

      // Stop if we've reached max results
      if (totalProcessed >= maxResults) {
        break;
      }
    } while (pageToken);

    syncStatus.isRunning = false;
    syncStatus.lastSync = new Date();
    console.log(
      `[Gmail Sync User] Completed. Processed ${totalProcessed} emails, sent ${syncStatus.eventsSent} events for extraction`
    );
  } catch (error) {
    console.error('[Gmail Sync User] Sync failed:', error);
    syncStatus.isRunning = false;
    syncStatus.error = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  }
}
```

---

## Usage Instructions

### Create the endpoint directory and file:

```bash
mkdir -p src/app/api/gmail/sync-user
# Then create route.ts with the code above
```

### Trigger extraction from browser console:

Since you're logged in at `localhost:3300`, you can trigger extraction directly from the browser console, which will automatically use your session cookie:

```javascript
// Browser Console - Trigger email sync with user OAuth
fetch('http://localhost:3300/api/gmail/sync-user', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Include session cookie
  body: JSON.stringify({
    folder: 'sent',      // 'sent', 'inbox', or 'all'
    maxResults: 100,     // Number of emails to process
    // since: '2024-01-01' // Optional: only emails after this date
  })
})
.then(res => res.json())
.then(data => {
  console.log('Sync started:', data);

  // Poll for status
  const checkStatus = setInterval(async () => {
    const status = await fetch('http://localhost:3300/api/gmail/sync-user', {
      credentials: 'include'
    }).then(r => r.json());

    console.log('Status:', status);

    if (!status.status.isRunning) {
      console.log('Sync completed!', status);
      clearInterval(checkStatus);
    }
  }, 2000);
})
.catch(err => console.error('Error:', err));
```

### Check sync status:

```javascript
// Get current sync status
fetch('http://localhost:3300/api/gmail/sync-user', {
  credentials: 'include'
})
.then(res => res.json())
.then(data => console.log('Sync status:', data));
```

---

## How It Works

1. **Authentication**: Uses `requireAuth()` to verify the user is logged in via better-auth session
2. **User OAuth Tokens**: Fetches Google OAuth tokens from the `accounts` table using `getGoogleTokens(userId)`
3. **Gmail Client**: Creates a Gmail API client with the user's OAuth tokens (same pattern as calendar)
4. **Token Refresh**: Automatically refreshes expired access tokens using the refresh token
5. **Email Sync**: Fetches emails from Gmail and emits Inngest events for entity extraction
6. **Entity Extraction**: The existing Inngest handlers process the events and extract entities

## Advantages Over Service Account

✅ **No domain-wide delegation required** - Works with any Google account
✅ **Uses existing user OAuth** - Already authenticated via better-auth
✅ **Proper permissions** - User explicitly granted Gmail read access
✅ **Same pattern as calendar** - Consistent with existing code
✅ **Session-based** - Works from browser with cookies

## Next Steps

1. Create the new endpoint file
2. Test from browser console while logged in
3. Monitor Inngest dashboard for extraction events
4. Check database for extracted entities

## Troubleshooting

### "No Google account linked"
- Sign out and sign back in with Google OAuth
- Ensure Gmail scopes are in the OAuth request

### "Invalid grant" or "Token expired"
- Tokens may be expired
- Sign out and sign back in to refresh tokens
- Check `accounts` table has valid `refreshToken`

### "Insufficient permissions"
- Verify Gmail API is enabled in Google Cloud Console
- Check OAuth scopes include `gmail.readonly`
- User may need to re-authorize

### Rate Limits
- Default 100ms delay between emails
- Reduce `maxResults` if hitting limits
- Monitor Google Cloud Console quotas
