/**
 * POST /api/extraction/relationships
 * Relationship-only extraction for catching up existing data
 * Re-processes extracted emails to extract relationships only
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getWeaviateClient } from '@/lib/weaviate/client';
import { COLLECTIONS } from '@/lib/weaviate/schema';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { getUserIdentity } from '@/lib/extraction/user-identity';
import { convertToInferredRelationships } from '@/lib/extraction/relationship-converter';
import { saveRelationships } from '@/lib/weaviate/relationships';
import type { Email } from '@/lib/google/types';
import type { EntityType } from '@/lib/extraction/types';
import { google } from 'googleapis';
import { getGoogleTokens } from '@/lib/auth';

const LOG_PREFIX = '[Relationship Extraction]';

type DateRange = 'last7days' | 'last30days' | 'last90days' | 'all';

interface RequestBody {
  dateRange?: DateRange;
  limit?: number;
}

/**
 * Calculate date filter based on date range option
 */
function getDateFilter(dateRange: DateRange): Date {
  const now = new Date();
  switch (dateRange) {
    case 'last7days':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'last30days':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'last90days':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'all':
    default:
      return new Date(0); // Beginning of time
  }
}

/**
 * Get unique source IDs (email IDs) that have entities extracted
 */
async function getExtractedEmailIds(userId: string, minDate: Date): Promise<Set<string>> {
  const client = await getWeaviateClient();
  const sourceIds = new Set<string>();

  // Query each entity collection to get unique sourceIds
  for (const [entityType, collectionName] of Object.entries(COLLECTIONS)) {
    try {
      const collection = client.collections.get(collectionName);

      const result = await collection.query.fetchObjects({
        limit: 10000,
        returnProperties: ['sourceId', 'userId', 'extractedAt'],
      });

      for (const obj of result.objects) {
        const props = obj.properties as any;
        if (props.userId === userId && props.sourceId) {
          // Check if extraction date is within range
          const extractedAt = props.extractedAt ? new Date(props.extractedAt) : new Date(0);
          if (extractedAt >= minDate) {
            sourceIds.add(props.sourceId);
          }
        }
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error fetching from ${collectionName}:`, error);
    }
  }

  return sourceIds;
}

/**
 * Initialize Gmail client with user's OAuth tokens
 */
async function getUserGmailClient(userId: string) {
  const tokens = await getGoogleTokens(userId);
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
    expiry_date: tokens.accessTokenExpiresAt
      ? new Date(tokens.accessTokenExpiresAt).getTime()
      : undefined,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Fetch email content from Gmail by ID
 */
async function fetchEmailById(gmail: any, emailId: string): Promise<Email | null> {
  try {
    const fullMessage = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full',
    });

    const headers = fullMessage.data.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    const subject = getHeader('Subject');
    const from = getHeader('From');
    const to = getHeader('To');
    const date = getHeader('Date');

    // Extract body
    let body = '';
    if (fullMessage.data.payload?.body?.data) {
      body = Buffer.from(fullMessage.data.payload.body.data, 'base64').toString('utf-8');
    } else if (fullMessage.data.payload?.parts) {
      const textPart = fullMessage.data.payload.parts.find(
        (p: any) => p.mimeType === 'text/plain' || p.mimeType === 'text/html'
      );
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    }

    return {
      id: emailId,
      subject,
      body,
      from: {
        name: from.split('<')[0].trim(),
        email: from.match(/<(.+)>/)?.[1] || from,
      },
      to: to.split(',').map((addr: string) => ({
        name: addr.split('<')[0].trim(),
        email: addr.match(/<(.+)>/)?.[1] || addr.trim(),
      })),
      date: new Date(date),
      threadId: fullMessage.data.threadId || emailId,
      labels: fullMessage.data.labelIds || [],
      snippet: fullMessage.data.snippet || '',
      isSent: (fullMessage.data.labelIds || []).includes('SENT'),
      hasAttachments: false,
      internalDate: new Date(date).getTime(),
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to fetch email ${emailId}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body: RequestBody = await request.json().catch(() => ({}));
    const dateRange: DateRange = body.dateRange || 'last30days';
    const limit = Math.min(body.limit || 100, 500); // Max 500 emails per batch

    console.log(`${LOG_PREFIX} Starting relationship extraction for user ${userId}`);
    console.log(`${LOG_PREFIX} Date range: ${dateRange}, limit: ${limit}`);

    const startTime = Date.now();
    const minDate = getDateFilter(dateRange);

    // Step 1: Get email IDs that have been extracted
    const extractedEmailIds = await getExtractedEmailIds(userId, minDate);
    console.log(`${LOG_PREFIX} Found ${extractedEmailIds.size} emails with entities`);

    if (extractedEmailIds.size === 0) {
      return NextResponse.json({
        success: true,
        message: 'No extracted emails found in the specified date range',
        processed: 0,
        relationships: 0,
        cost: 0,
      });
    }

    // Step 2: Initialize Gmail client
    const gmail = await getUserGmailClient(userId);
    const userIdentity = await getUserIdentity(userId);
    const extractor = getEntityExtractor(undefined, userIdentity);

    // Step 3: Process emails to extract relationships
    const emailIdsToProcess = Array.from(extractedEmailIds).slice(0, limit);
    let totalRelationships = 0;
    let totalCost = 0;
    let processedCount = 0;
    let failedCount = 0;

    for (const emailId of emailIdsToProcess) {
      try {
        // Fetch email content
        const email = await fetchEmailById(gmail, emailId);
        if (!email) {
          failedCount++;
          continue;
        }

        // Extract entities and relationships
        const result = await extractor.extractFromEmail(email);

        // Only save relationships (entities already exist)
        if (result.relationships.length > 0) {
          const inferredRelationships = convertToInferredRelationships(
            result.relationships,
            emailId,
            userId
          );

          const savedCount = await saveRelationships(inferredRelationships, userId);
          totalRelationships += savedCount;
          console.log(`${LOG_PREFIX} Saved ${savedCount} relationships from email ${emailId}`);
        }

        totalCost += result.cost;
        processedCount++;

        // Log progress every 10 emails
        if (processedCount % 10 === 0) {
          console.log(
            `${LOG_PREFIX} Progress: ${processedCount}/${emailIdsToProcess.length} emails processed`
          );
        }

        // Small delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to process email ${emailId}:`, error);
        failedCount++;
      }
    }

    const processingTime = Date.now() - startTime;

    console.log(`${LOG_PREFIX} Completed relationship extraction:`);
    console.log(`${LOG_PREFIX}   Processed: ${processedCount}/${emailIdsToProcess.length}`);
    console.log(`${LOG_PREFIX}   Failed: ${failedCount}`);
    console.log(`${LOG_PREFIX}   Relationships: ${totalRelationships}`);
    console.log(`${LOG_PREFIX}   Cost: $${totalCost.toFixed(6)}`);
    console.log(`${LOG_PREFIX}   Time: ${(processingTime / 1000).toFixed(2)}s`);

    return NextResponse.json({
      success: true,
      processed: processedCount,
      failed: failedCount,
      relationships: totalRelationships,
      cost: Math.round(totalCost * 10000) / 10000,
      processingTimeMs: processingTime,
      totalEmails: extractedEmailIds.size,
      message: `Extracted ${totalRelationships} relationships from ${processedCount} emails`,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to run relationship extraction',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/extraction/relationships
 * Get status/info about relationship extraction capability
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Get count of emails with entities
    const allEmailIds = await getExtractedEmailIds(userId, new Date(0));

    return NextResponse.json({
      available: true,
      totalExtractedEmails: allEmailIds.size,
      message: allEmailIds.size > 0
        ? `${allEmailIds.size} emails available for relationship extraction`
        : 'No extracted emails found. Run entity extraction first.',
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} GET Error:`, error);

    return NextResponse.json(
      {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
