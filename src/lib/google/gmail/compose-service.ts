/**
 * Gmail Compose Service
 * Handles sending emails and creating drafts
 */

import type { gmail_v1 } from 'googleapis';
import type { IGmailComposeService } from './interfaces';

export class GmailComposeService implements IGmailComposeService {
  constructor(private gmail: gmail_v1.Gmail) {}

  /**
   * Send an email
   */
  async sendEmail(
    to: string,
    subject: string,
    body: string,
    options?: {
      cc?: string;
      bcc?: string;
      replyTo?: string;
      isHtml?: boolean;
    }
  ): Promise<string> {
    try {
      const rawMessage = this.buildRawMessage(to, subject, body, options);
      const encodedMessage = this.encodeMessage(rawMessage);

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });

      return response.data.id || '';
    } catch (error) {
      console.error('[Gmail] Failed to send email:', error);
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  /**
   * Create a draft email
   */
  async createDraft(
    to: string,
    subject: string,
    body: string,
    options?: {
      cc?: string;
      bcc?: string;
      isHtml?: boolean;
    }
  ): Promise<string> {
    try {
      const rawMessage = this.buildRawMessage(to, subject, body, options);
      const encodedMessage = this.encodeMessage(rawMessage);

      const response = await this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw: encodedMessage,
          },
        },
      });

      return response.data.id || '';
    } catch (error) {
      console.error('[Gmail] Failed to create draft:', error);
      throw new Error(`Failed to create draft: ${error}`);
    }
  }

  /**
   * Build raw email message in RFC 2822 format
   */
  private buildRawMessage(
    to: string,
    subject: string,
    body: string,
    options?: {
      cc?: string;
      bcc?: string;
      replyTo?: string;
      isHtml?: boolean;
    }
  ): string {
    const messageParts: string[] = [
      `To: ${to}`,
      `Subject: ${subject}`,
    ];

    if (options?.cc) {
      messageParts.push(`Cc: ${options.cc}`);
    }

    if (options?.bcc) {
      messageParts.push(`Bcc: ${options.bcc}`);
    }

    if (options?.replyTo) {
      messageParts.push(`Reply-To: ${options.replyTo}`);
    }

    const contentType = options?.isHtml
      ? 'Content-Type: text/html; charset=utf-8'
      : 'Content-Type: text/plain; charset=utf-8';
    messageParts.push(contentType);
    messageParts.push('');
    messageParts.push(body);

    return messageParts.join('\r\n');
  }

  /**
   * Encode message for Gmail API (base64url)
   */
  private encodeMessage(rawMessage: string): string {
    return Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
