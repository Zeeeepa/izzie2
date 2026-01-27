/**
 * Admin Changelog Ingest API Route
 *
 * POST /api/admin/changelog/ingest
 * Manual trigger to ingest CHANGELOG.md into the RAG knowledge base.
 *
 * Security: Requires CRON_SECRET in Authorization header.
 *
 * Query params:
 * - clear: "true" to clear existing entries before ingestion (default: true)
 *
 * Request body (optional):
 * {
 *   content?: string;  // Raw changelog content (if not provided, reads CHANGELOG.md)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import {
  ingestChangelogContent,
  ingestChangelogFile,
  getAllChangelogEntries,
} from '@/lib/changelog';

const LOG_PREFIX = '[API:ChangelogIngest]';

/**
 * Verify admin authorization via CRON_SECRET
 */
function verifyAdminAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // If no secret configured, deny all requests
  if (!cronSecret) {
    console.log(`${LOG_PREFIX} CRON_SECRET not configured - denying request`);
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * POST /api/admin/changelog/ingest
 * Ingest changelog entries into the knowledge base
 */
export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} Processing changelog ingest request`);

  // Verify admin authorization
  if (!verifyAdminAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized - admin access required' },
      { status: 401 }
    );
  }

  try {
    const url = new URL(request.url);
    const clearExisting = url.searchParams.get('clear') !== 'false';

    // Check if content was provided in body
    let body: { content?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body provided, will read from file
    }

    let result;

    if (body.content) {
      // Ingest from provided content
      console.log(`${LOG_PREFIX} Ingesting from provided content`);
      result = await ingestChangelogContent(body.content, { clearExisting });
    } else {
      // Read from CHANGELOG.md in project root
      const changelogPath = join(process.cwd(), 'CHANGELOG.md');
      console.log(`${LOG_PREFIX} Ingesting from file: ${changelogPath}`);
      result = await ingestChangelogFile(changelogPath, { clearExisting });
    }

    console.log(
      `${LOG_PREFIX} Ingestion complete: ${result.entriesStored}/${result.entriesProcessed} entries stored`
    );

    return NextResponse.json({
      status: 'success',
      message: 'Changelog ingested successfully',
      result: {
        entriesProcessed: result.entriesProcessed,
        entriesStored: result.entriesStored,
        errors: result.errors,
        storedAt: result.storedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Ingestion error:`, error);

    return NextResponse.json(
      {
        error: 'Failed to ingest changelog',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/changelog/ingest
 * Get current changelog entries (for debugging)
 */
export async function GET(request: NextRequest) {
  console.log(`${LOG_PREFIX} Processing changelog get request`);

  // Verify admin authorization
  if (!verifyAdminAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized - admin access required' },
      { status: 401 }
    );
  }

  try {
    const entries = await getAllChangelogEntries();

    return NextResponse.json({
      status: 'success',
      count: entries.length,
      entries: entries.map((entry) => ({
        version: entry.version,
        date: entry.date?.toISOString() || null,
        type: entry.type,
        title: entry.title,
        issueNumber: entry.issueNumber,
      })),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Get entries error:`, error);

    return NextResponse.json(
      {
        error: 'Failed to get changelog entries',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
