/**
 * Gmail Utility Functions
 * Shared helpers used across Gmail services
 */

import type { gmail_v1 } from 'googleapis';
import type { Email, EmailAddress } from '../types';

const RATE_LIMIT_DELAY_MS = 100;

/**
 * Sleep utility for rate limiting
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default delay between API requests
 */
export function getRateLimitDelay(): number {
  return RATE_LIMIT_DELAY_MS;
}

/**
 * Get header value by name from message headers
 */
export function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string
): string | undefined {
  const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || undefined;
}

/**
 * Parse email address from header string
 * Format: "Name <email@example.com>" or "email@example.com"
 */
export function parseEmailAddress(headerValue: string): EmailAddress {
  const match = headerValue.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);

  if (match) {
    return {
      name: match[1]?.trim() || undefined,
      email: match[2].trim(),
    };
  }

  return {
    email: headerValue.trim(),
  };
}

/**
 * Parse comma-separated email address list
 */
export function parseEmailAddressList(headerValue: string): EmailAddress[] {
  if (!headerValue) return [];

  return headerValue
    .split(',')
    .map((addr) => parseEmailAddress(addr.trim()))
    .filter((addr) => addr.email);
}

/**
 * Decode base64url string (Gmail encoding)
 */
export function decodeBase64(data: string): string {
  try {
    // Gmail uses base64url encoding (replace - with + and _ with /)
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch (error) {
    console.error('[Gmail] Failed to decode base64:', error);
    return '';
  }
}

/**
 * Parse email body from MIME format
 */
export function parseEmailBody(
  payload?: gmail_v1.Schema$MessagePart
): { body: string; htmlBody?: string } {
  if (!payload) {
    return { body: '' };
  }

  let body = '';
  let htmlBody: string | undefined;

  // Check if this part has body data
  if (payload.body?.data) {
    const decodedBody = decodeBase64(payload.body.data);

    if (payload.mimeType === 'text/plain') {
      body = decodedBody;
    } else if (payload.mimeType === 'text/html') {
      htmlBody = decodedBody || undefined;
    }
  }

  // Recursively check parts
  if (payload.parts) {
    for (const part of payload.parts) {
      const { body: partBody, htmlBody: partHtml } = parseEmailBody(part);

      if (partBody && !body) {
        body = partBody;
      }
      if (partHtml && !htmlBody) {
        htmlBody = partHtml;
      }
    }
  }

  return { body, htmlBody };
}

/**
 * Check if email has attachments
 */
export function hasAttachments(payload?: gmail_v1.Schema$MessagePart): boolean {
  if (!payload) return false;

  // Check if this part is an attachment
  if (payload.filename && payload.body?.attachmentId) {
    return true;
  }

  // Recursively check parts
  if (payload.parts) {
    return payload.parts.some((part) => hasAttachments(part));
  }

  return false;
}

/**
 * Parse Gmail API message into Email type
 */
export function parseEmail(message: gmail_v1.Schema$Message): Email {
  const headers = message.payload?.headers || [];
  const labelIds = message.labelIds || [];

  // Extract headers
  const from = parseEmailAddress(getHeader(headers, 'From') || '');
  const to = parseEmailAddressList(getHeader(headers, 'To') || '');
  const cc = parseEmailAddressList(getHeader(headers, 'Cc') || '');
  const bcc = parseEmailAddressList(getHeader(headers, 'Bcc') || '');
  const subject = getHeader(headers, 'Subject') || '(No Subject)';
  const date = new Date(parseInt(message.internalDate || '0', 10));

  // Extract headers useful for classification
  const classificationHeaders: Record<string, string> = {};
  const listUnsubscribe = getHeader(headers, 'List-Unsubscribe');
  if (listUnsubscribe) {
    classificationHeaders['list-unsubscribe'] = listUnsubscribe;
  }

  // Parse body
  const { body, htmlBody } = parseEmailBody(message.payload);

  // Determine if sent
  const isSent = labelIds.includes('SENT');

  // Check for attachments
  const emailHasAttachments = hasAttachments(message.payload);

  return {
    id: message.id || '',
    threadId: message.threadId || '',
    from,
    to,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
    subject,
    body,
    htmlBody,
    date,
    labels: labelIds,
    isSent,
    hasAttachments: emailHasAttachments,
    snippet: message.snippet || undefined,
    internalDate: parseInt(message.internalDate || '0', 10),
    headers: Object.keys(classificationHeaders).length > 0 ? classificationHeaders : undefined,
  };
}

/**
 * Build Gmail search query
 */
export function buildQuery(
  folder: string,
  since?: Date,
  excludePromotions?: boolean,
  excludeSocial?: boolean
): string {
  const parts: string[] = [];

  // Add date filter if provided
  if (since) {
    const dateStr = since.toISOString().split('T')[0]; // YYYY-MM-DD
    parts.push(`after:${dateStr}`);
  }

  // Folder-specific filters
  if (folder === 'inbox') {
    parts.push('in:inbox');
  } else if (folder === 'sent') {
    parts.push('in:sent');
  }
  // 'all' means no folder filter

  // Always exclude spam and trash
  parts.push('-label:spam');
  parts.push('-label:trash');

  // Optionally exclude promotional emails
  if (excludePromotions) {
    parts.push('-category:promotions');
  }

  // Optionally exclude social emails
  if (excludeSocial) {
    parts.push('-category:social');
  }

  return parts.join(' ');
}

/**
 * Get label IDs for folder
 */
export function getFolderLabels(folder: string): string[] {
  switch (folder) {
    case 'inbox':
      return ['INBOX'];
    case 'sent':
      return ['SENT'];
    case 'all':
    default:
      return [];
  }
}
