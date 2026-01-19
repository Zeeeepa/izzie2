/**
 * URL Content Fetcher
 * Fetches and extracts clean text content from URLs
 */

import type { FetchResult, FetchOptions } from './types';

const DEFAULT_TIMEOUT = Number(process.env.FETCH_TIMEOUT_MS) || 30000; // 30 seconds
const DEFAULT_MAX_SIZE = Number(process.env.FETCH_MAX_SIZE_BYTES) || 5 * 1024 * 1024; // 5MB
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; IzzieBot/1.0; +https://izzie.ai/bot)';

/**
 * Fetch URL with timeout and size limits
 */
export async function fetchUrl(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const followRedirects = options.followRedirects ?? true;

  console.log(`[Fetcher] Fetching: ${url}`);

  const fetchedAt = new Date();

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: followRedirects ? 'follow' : 'manual',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          url,
          content: '',
          contentType: 'error',
          fetchedAt,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxSize) {
        return {
          url,
          content: '',
          contentType: 'error',
          fetchedAt,
          error: `Content too large: ${contentLength} bytes (max ${maxSize})`,
        };
      }

      // Determine content type
      const contentTypeHeader = response.headers.get('content-type') || '';
      let contentType = 'html';

      if (contentTypeHeader.includes('application/pdf')) {
        contentType = 'pdf';
      } else if (contentTypeHeader.includes('text/plain')) {
        contentType = 'text';
      } else if (contentTypeHeader.includes('application/json')) {
        contentType = 'json';
      }

      // Get response text
      const text = await response.text();

      // Check size after fetching
      if (text.length > maxSize) {
        return {
          url,
          content: '',
          contentType: 'error',
          fetchedAt,
          error: `Content too large: ${text.length} bytes (max ${maxSize})`,
        };
      }

      // Extract content based on type
      let extractedContent: string;
      let title: string | undefined;

      if (contentType === 'html') {
        const extraction = extractMainContent(text);
        extractedContent = extraction.content;
        title = extraction.title;
      } else if (contentType === 'pdf') {
        // PDF text extraction is stubbed for now
        extractedContent = '[PDF content - extraction not yet implemented]';
        title = undefined;
      } else if (contentType === 'json') {
        // For JSON, just clean it up
        extractedContent = cleanText(text);
        title = undefined;
      } else {
        // Plain text
        extractedContent = cleanText(text);
        title = undefined;
      }

      console.log(
        `[Fetcher] Successfully fetched ${url} (${extractedContent.length} chars)`
      );

      return {
        url,
        title,
        content: extractedContent,
        contentType,
        fetchedAt,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error(`[Fetcher] Failed to fetch ${url}:`, error);

    return {
      url,
      content: '',
      contentType: 'error',
      fetchedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Extract main content from HTML
 * Removes navigation, ads, scripts, and extracts readable text
 */
export function extractMainContent(html: string): { content: string; title?: string } {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? cleanText(titleMatch[1]) : undefined;

  // Remove script and style tags
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove common navigation and footer elements
  text = text.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');
  text = text.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
  text = text.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');
  text = text.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Clean up the text
  return {
    content: cleanText(text),
    title,
  };
}

/**
 * Clean and normalize text content
 */
export function cleanText(text: string): string {
  // Normalize whitespace
  let cleaned = text.replace(/\s+/g, ' ');

  // Remove excessive newlines
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');

  // Trim
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  };

  let decoded = text;

  // Replace named entities
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  // Replace numeric entities (&#123; and &#xAB;)
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });

  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  return decoded;
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
