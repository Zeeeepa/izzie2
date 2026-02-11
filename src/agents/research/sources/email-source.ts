/**
 * Email Source for Research Agent
 * Searches emails using GmailService
 */

import { GmailService } from '@/lib/google/gmail';
import type { Auth } from 'googleapis';
import type { ResearchSourceResult } from '../types';
import type { Email } from '@/lib/google/types';

const MAX_RESULTS_DEFAULT = 5;

export interface EmailSearchOptions {
  maxResults?: number;
  since?: Date;
  folder?: 'inbox' | 'sent' | 'all';
}

/**
 * Search emails by query keywords
 * Returns top results with unified ResearchSourceResult format
 */
export async function searchEmails(
  auth: Auth.GoogleAuth | Auth.OAuth2Client,
  query: string,
  options: EmailSearchOptions = {}
): Promise<ResearchSourceResult[]> {
  const { maxResults = MAX_RESULTS_DEFAULT, since, folder = 'all' } = options;

  const gmailService = new GmailService(auth);

  try {
    // Extract keywords from query for Gmail API server-side search
    const keywords = extractKeywords(query);

    // Use Gmail API query syntax for server-side filtering
    // This searches subject, body, sender, etc.
    const batch = await gmailService.fetchEmails({
      folder,
      maxResults,
      since,
      keywords, // Pass keywords to Gmail API for server-side search
    });

    // Convert to unified format
    const results: ResearchSourceResult[] = batch.emails
      .slice(0, maxResults)
      .map((email) => emailToResearchResult(email));

    console.log(
      `[EmailSource] Found ${results.length} emails matching "${query}" (keywords: ${keywords.join(', ')})`
    );

    return results;
  } catch (error) {
    console.error('[EmailSource] Failed to search emails:', error);
    return [];
  }
}

/**
 * Extract meaningful keywords from search query
 * Filters out stop words and short words to improve Gmail API search
 */
function extractKeywords(query: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'from', 'by', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'can', 'could', 'may', 'might', 'must', 'this', 'that', 'these', 'those',
  ]);

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .filter(Boolean);
}

/**
 * Convert Email to ResearchSourceResult
 */
function emailToResearchResult(email: Email): ResearchSourceResult {
  const senderName = email.from.name || email.from.email;
  const dateStr = email.date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return {
    sourceType: 'email',
    title: email.subject,
    snippet: truncateText(email.snippet || email.body, 200),
    link: email.id,
    reference: `Email from ${senderName} on ${dateStr}`,
    date: email.date,
    metadata: {
      threadId: email.threadId,
      from: email.from,
      to: email.to,
      hasAttachments: email.hasAttachments,
      labels: email.labels,
    },
  };
}

/**
 * Truncate text to specified length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
