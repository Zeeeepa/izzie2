/**
 * MCP Embeddings Sync API Route
 * Trigger embedding sync for user's MCP tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { refreshUserToolEmbeddings } from '@/lib/mcp/tool-discovery';

const LOG_PREFIX = '[MCP Embeddings Sync]';

/**
 * POST /api/mcp/embeddings/sync
 * Trigger embedding sync for all of user's enabled MCP servers
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    console.log(`${LOG_PREFIX} Starting embedding sync for user ${userId}`);

    const stats = await refreshUserToolEmbeddings(userId);

    console.log(
      `${LOG_PREFIX} Sync complete: ${stats.serversProcessed} servers, ` +
        `${stats.toolsCreated} created, ${stats.toolsUpdated} updated, ` +
        `${stats.toolsDeleted} deleted, ${stats.toolsUnchanged} unchanged`
    );

    return NextResponse.json({
      created: stats.toolsCreated,
      updated: stats.toolsUpdated,
      deleted: stats.toolsDeleted,
      unchanged: stats.toolsUnchanged,
      servers: stats.serversProcessed,
      errors: stats.errors.length > 0 ? stats.errors : undefined,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Sync error:`, error);
    return NextResponse.json(
      {
        error: 'Failed to sync embeddings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
