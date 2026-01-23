/**
 * API Keys Management Endpoints
 *
 * POST /api/user/api-keys - Create a new API key
 * GET /api/user/api-keys - List user's API keys
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { generateApiKey, listApiKeys } from '@/lib/auth/api-keys';
import { z } from 'zod';

const LOG_PREFIX = '[API Keys Route]';

/**
 * Input validation schema for creating API keys
 */
const createKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  expiresInDays: z
    .number()
    .int()
    .min(1, 'Expiration must be at least 1 day')
    .max(365, 'Expiration must be at most 365 days')
    .optional()
    .nullable(),
});

/**
 * POST /api/user/api-keys
 * Create a new API key for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const validation = createKeySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.issues.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        },
        { status: 400 }
      );
    }

    const { name, expiresInDays } = validation.data;

    const result = await generateApiKey(userId, name, expiresInDays ?? undefined);

    console.log(`${LOG_PREFIX} Created API key for user: ${userId}, name: ${name}`);

    return NextResponse.json({
      id: result.id,
      name: result.name,
      key: result.key, // Only returned on creation
      keyPrefix: result.keyPrefix,
      scopes: result.scopes,
      expiresAt: result.expiresAt,
      createdAt: result.createdAt,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} POST error:`, error);

    if (error instanceof Error) {
      if (error.message.includes('Unauthorized')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message.includes('Maximum of')) {
        return NextResponse.json({ error: error.message }, { status: 429 });
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/user/api-keys
 * List all API keys for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const keys = await listApiKeys(userId);

    return NextResponse.json({ keys });
  } catch (error) {
    console.error(`${LOG_PREFIX} GET error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
