/**
 * Gmail Message Service
 * Handles reading and searching individual emails
 */

import type { gmail_v1 } from 'googleapis';
import type { Email, EmailThread } from '../types';
import type { IGmailMessageService } from './interfaces';
import { parseEmail, sleep, getRateLimitDelay } from './utils';

export class GmailMessageService implements IGmailMessageService {
  constructor(private gmail: gmail_v1.Gmail) {}

  /**
   * Get a single email by ID with full content
   */
  async getEmail(id: string): Promise<Email> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      });

      const message = response.data;
      return parseEmail(message);
    } catch (error) {
      console.error(`[Gmail] Failed to get email ${id}:`, error);
      throw new Error(`Failed to get email ${id}: ${error}`);
    }
  }

  /**
   * Get email thread with all messages
   */
  async getThread(threadId: string): Promise<EmailThread> {
    try {
      const response = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      });

      const thread = response.data;
      const emails = (thread.messages || []).map((msg) => parseEmail(msg));

      return {
        id: thread.id || threadId,
        emails,
        snippet: thread.snippet || '',
        historyId: thread.historyId || '',
      };
    } catch (error) {
      console.error(`[Gmail] Failed to get thread ${threadId}:`, error);
      throw new Error(`Failed to get thread ${threadId}: ${error}`);
    }
  }

  /**
   * Search for emails matching a query
   */
  async searchEmails(query: string, maxResults: number = 10): Promise<Email[]> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
      });

      const messages = response.data.messages || [];
      const emails: Email[] = [];

      for (const message of messages) {
        if (message.id) {
          try {
            const email = await this.getEmail(message.id);
            emails.push(email);
            await sleep(getRateLimitDelay());
          } catch (error) {
            console.error(`[Gmail] Failed to fetch email ${message.id}:`, error);
          }
        }
      }

      return emails;
    } catch (error) {
      console.error('[Gmail] Failed to search emails:', error);
      throw new Error(`Failed to search emails: ${error}`);
    }
  }
}
