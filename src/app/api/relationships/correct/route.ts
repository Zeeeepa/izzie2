/**
 * Relationship Correction API
 * POST /api/relationships/correct
 *
 * Allows correcting relationship status when user indicates
 * they are no longer associated with an entity.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithTestBypass } from '@/lib/auth/test-auth';
import { rateLimit, getRetryAfterSeconds } from '@/lib/rate-limit';
import { z } from 'zod';
import {
  correctRelationship,
  detectCorrectionIntent,
} from '@/lib/chat/tools/relationship-correction';

const LOG_PREFIX = '[Relationships Correct API]';

/**
 * Request body schema
 */
const RequestSchema = z.object({
  // Either provide entityName directly or a message to parse
  entityName: z.string().optional(),
  message: z.string().optional(),
  // Optional: specific relationship ID to correct
  relationshipId: z.string().optional(),
  // Optional: end date (defaults to today)
  endDate: z.string().optional(),
}).refine(
  (data) => data.entityName || data.message,
  { message: 'Either entityName or message must be provided' }
);

/**
 * POST /api/relationships/correct
 * Correct a relationship status to 'former'
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const { userId } = await requireAuthWithTestBypass(request);

    // Rate limiting
    const rateLimitResult = await rateLimit(userId, true);
    if (!rateLimitResult.success) {
      const retryAfter = rateLimitResult.reset
        ? getRetryAfterSeconds(rateLimitResult.reset)
        : 60;
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
          },
        }
      );
    }

    // Parse request body
    const body = await request.json();
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { entityName, message, relationshipId, endDate } = parseResult.data;

    // Determine entity name from message if not provided directly
    let targetEntityName = entityName;
    let detectionResult = null;

    if (!targetEntityName && message) {
      detectionResult = detectCorrectionIntent(message);
      if (!detectionResult.detected || !detectionResult.entityName) {
        return NextResponse.json(
          {
            error: 'Could not detect correction intent',
            message: 'The message does not appear to indicate a relationship correction.',
            detectionResult,
          },
          { status: 400 }
        );
      }
      targetEntityName = detectionResult.entityName;
    }

    if (!targetEntityName) {
      return NextResponse.json(
        { error: 'Could not determine entity name' },
        { status: 400 }
      );
    }

    console.log(`${LOG_PREFIX} User ${userId} correcting relationship with: "${targetEntityName}"`);

    // Execute the correction
    const result = await correctRelationship(targetEntityName, userId, {
      relationshipId,
      endDate,
    });

    // Return appropriate response based on result
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        updatedRelationship: result.updatedRelationship,
        detectionResult,
      });
    }

    // Multiple matches or no matches
    return NextResponse.json({
      success: false,
      message: result.message,
      matchedRelationships: result.matchedRelationships,
      detectionResult,
    });

  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return NextResponse.json(
      {
        error: 'Failed to correct relationship',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
