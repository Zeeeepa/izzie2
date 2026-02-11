/**
 * Gmail Sync Service
 * Handles batch operations and email synchronization
 */

import type { gmail_v1 } from 'googleapis';
import type { Email, EmailBatch, FetchEmailOptions } from '../types';
import type { IGmailSyncService } from './interfaces';
import { parseEmail, sleep, getRateLimitDelay, buildQuery, getFolderLabels } from './utils';
import { GmailLabelService } from './label-service';
import { GmailMessageService } from './message-service';

const MAX_RESULTS_DEFAULT = 100;
const MAX_RESULTS_LIMIT = 500;

export class GmailSyncService implements IGmailSyncService {
  private messageService: GmailMessageService;
  private labelService: GmailLabelService;

  constructor(private gmail: gmail_v1.Gmail) {
    this.messageService = new GmailMessageService(gmail);
    this.labelService = new GmailLabelService(gmail);
  }

  /**
   * Fetch emails with pagination and filtering
   */
  async fetchEmails(options: FetchEmailOptions): Promise<EmailBatch> {
    const {
      folder,
      maxResults = MAX_RESULTS_DEFAULT,
      pageToken,
      since,
      labelIds,
      excludePromotions = false,
      excludeSocial = false,
      keywords,
    } = options;

    // Build query string with optional keywords for server-side filtering
    const query = buildQuery(folder, since, excludePromotions, excludeSocial, keywords);

    // Determine label IDs based on folder
    const labels = labelIds || getFolderLabels(folder);

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: Math.min(maxResults, MAX_RESULTS_LIMIT),
        pageToken,
        q: query,
        labelIds: labels.length > 0 ? labels : undefined,
      });

      const messages = response.data.messages || [];
      const emails: Email[] = [];

      // Fetch full email details for each message
      for (const message of messages) {
        if (message.id) {
          try {
            const email = await this.messageService.getEmail(message.id);
            emails.push(email);

            // Add small delay to respect rate limits
            await sleep(getRateLimitDelay());
          } catch (error) {
            console.error(`[Gmail] Failed to fetch email ${message.id}:`, error);
            // Continue with other emails
          }
        }
      }

      return {
        emails,
        nextPageToken: response.data.nextPageToken || undefined,
        resultSizeEstimate: response.data.resultSizeEstimate || 0,
      };
    } catch (error) {
      console.error('[Gmail] Failed to fetch emails:', error);
      throw new Error(`Failed to fetch emails: ${error}`);
    }
  }

  /**
   * Batch fetch multiple emails
   */
  async batchFetch(ids: string[]): Promise<Email[]> {
    const emails: Email[] = [];

    // Gmail API doesn't have native batch get, so fetch sequentially with rate limiting
    for (const id of ids) {
      try {
        const email = await this.messageService.getEmail(id);
        emails.push(email);
        await sleep(getRateLimitDelay());
      } catch (error) {
        console.error(`[Gmail] Failed to fetch email ${id} in batch:`, error);
        // Continue with other emails
      }
    }

    return emails;
  }

  /**
   * Batch archive multiple emails
   */
  async batchArchive(ids: string[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await this.labelService.archiveEmail(id);
        success++;
        await sleep(getRateLimitDelay());
      } catch (error) {
        console.error(`[Gmail] Failed to archive email ${id}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Batch trash multiple emails
   */
  async batchTrash(ids: string[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await this.labelService.trashEmail(id);
        success++;
        await sleep(getRateLimitDelay());
      } catch (error) {
        console.error(`[Gmail] Failed to trash email ${id}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }
}
