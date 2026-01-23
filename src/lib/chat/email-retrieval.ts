/**
 * Email Retrieval for Chat Context
 *
 * Retrieves recent emails using GmailService for chat personalization.
 */

import { google } from 'googleapis';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { GmailService } from '@/lib/google/gmail';
import type { RecentEmailSummary } from './context-retrieval';

const LOG_PREFIX = '[EmailRetrieval]';

interface GetRecentEmailsOptions {
  maxResults?: number;
  hoursBack?: number;
  accountId?: string; // Optional specific Google account ID for multi-account support
}

/**
 * Initialize OAuth2 client with user's tokens for Gmail access
 * @param userId - The user ID
 * @param accountId - Optional specific Google account ID. If not provided, uses primary account.
 */
async function getGmailClient(
  userId: string,
  accountId?: string
): Promise<{ service: GmailService; accountId: string }> {
  const tokens = await getGoogleTokens(userId, accountId);
  if (!tokens) {
    throw new Error('No Google tokens found for user');
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
    expiry_date: tokens.accessTokenExpiresAt ? new Date(tokens.accessTokenExpiresAt).getTime() : undefined,
  });

  // Auto-refresh tokens if needed
  oauth2Client.on('tokens', async (newTokens) => {
    console.log(`${LOG_PREFIX} Tokens refreshed for user:`, userId);
    await updateGoogleTokens(userId, newTokens);
  });

  return { service: new GmailService(oauth2Client), accountId: tokens.accountId };
}

/**
 * Get recent emails for chat context
 *
 * Returns a summarized list of recent emails (without full body content)
 * to provide email awareness in chat without overwhelming the context.
 */
export async function getRecentEmails(
  userId: string,
  options: GetRecentEmailsOptions = {}
): Promise<RecentEmailSummary[]> {
  const { maxResults = 10, hoursBack = 24, accountId } = options;

  try {
    const { service: gmailService } = await getGmailClient(userId, accountId);

    // Calculate the "since" date
    const since = new Date();
    since.setHours(since.getHours() - hoursBack);

    // Fetch recent emails from inbox
    const result = await gmailService.fetchEmails({
      folder: 'inbox',
      maxResults,
      since,
      excludePromotions: true,
      excludeSocial: true,
    });

    // Map to RecentEmailSummary (avoiding full body exposure)
    const summaries: RecentEmailSummary[] = result.emails.map((email) => ({
      id: email.id,
      from: email.from.name || email.from.email,
      subject: email.subject,
      date: email.date,
      snippet: email.snippet,
    }));

    console.log(`${LOG_PREFIX} Retrieved ${summaries.length} recent emails for user ${userId}`);
    return summaries;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to retrieve recent emails:`, error);
    throw error;
  }
}
