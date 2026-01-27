/**
 * Google Chat Sync API Endpoint
 * Triggers chat synchronization from Google Chat API
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { google } from 'googleapis';
import { getChatService, ChatSpace, ChatMessage, ChatSyncStatus } from '@/lib/google/chat';
import { saveEntities } from '@/lib/weaviate/entities';
import type { Entity } from '@/lib/extraction/types';

// In-memory sync status (in production, use Redis or database)
let syncStatus: ChatSyncStatus = {
  isRunning: false,
  spacesProcessed: 0,
  messagesProcessed: 0,
  totalSpaces: 0,
};

// Store synced spaces for display
let syncedSpaces: Array<{
  name: string;
  displayName: string;
  type: string;
  messageCount: number;
}> = [];

// SSE clients for progress updates
const progressClients: Set<ReadableStreamDefaultController<Uint8Array>> = new Set();

/**
 * Broadcast progress update to all connected SSE clients
 */
function broadcastProgress(data: ChatSyncStatus & { spaces?: typeof syncedSpaces }) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(message);

  for (const controller of progressClients) {
    try {
      controller.enqueue(encoded);
    } catch {
      // Client disconnected, will be cleaned up
      progressClients.delete(controller);
    }
  }
}

/**
 * POST /api/chat-sync
 * Start chat synchronization
 */
export async function POST(request: NextRequest) {
  try {
    // Check if sync is already running
    if (syncStatus.isRunning) {
      return NextResponse.json(
        {
          error: 'Sync already in progress',
          status: syncStatus,
        },
        { status: 409 }
      );
    }

    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { maxMessagesPerSpace = 500 } = body;

    // Start sync (don't await - run in background)
    startSync(userId, maxMessagesPerSpace).catch((error) => {
      console.error('[Chat Sync] Background sync failed:', error);
      syncStatus.isRunning = false;
      syncStatus.error = error.message;
      broadcastProgress({ ...syncStatus, spaces: syncedSpaces });
    });

    return NextResponse.json({
      message: 'Chat sync started',
      status: syncStatus,
    });
  } catch (error) {
    console.error('[Chat Sync] Failed to start sync:', error);
    return NextResponse.json(
      { error: `Failed to start sync: ${error}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chat-sync
 * Get sync status
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const stream = searchParams.get('stream');

  // If stream=true, return SSE stream for real-time progress
  if (stream === 'true') {
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        progressClients.add(controller);

        // Send initial status
        const initialMessage = `data: ${JSON.stringify({ ...syncStatus, spaces: syncedSpaces })}\n\n`;
        controller.enqueue(encoder.encode(initialMessage));
      },
      cancel(controller) {
        progressClients.delete(controller);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // Regular JSON response
  return NextResponse.json({
    status: syncStatus,
    spaces: syncedSpaces,
  });
}

/**
 * Background sync function
 */
async function startSync(userId: string, maxMessagesPerSpace: number): Promise<void> {
  syncStatus = {
    isRunning: true,
    spacesProcessed: 0,
    messagesProcessed: 0,
    totalSpaces: 0,
    startedAt: new Date(),
  };
  syncedSpaces = [];

  broadcastProgress({ ...syncStatus, spaces: syncedSpaces });

  try {
    console.log(`[Chat Sync] Starting sync for user ${userId}...`);

    // Get Google OAuth tokens from database
    const tokens = await getGoogleTokens(userId);

    if (!tokens || !tokens.accessToken) {
      throw new Error('No Google access token found for user');
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    // Set credentials
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken || undefined,
    });

    // Set up token refresh callback to update database
    oauth2Client.on('tokens', async (newTokens) => {
      console.log('[Chat Sync] OAuth tokens refreshed automatically');
      await updateGoogleTokens(userId, newTokens);
    });

    // Initialize Chat Service
    const chatService = await getChatService(oauth2Client);

    // Fetch all spaces
    console.log('[Chat Sync] Fetching spaces...');
    const spaces = await chatService.listAllSpaces();

    syncStatus.totalSpaces = spaces.length;
    broadcastProgress({ ...syncStatus, spaces: syncedSpaces });

    console.log(`[Chat Sync] Found ${spaces.length} spaces`);

    // Process each space
    const allEntities: Entity[] = [];

    for (const space of spaces) {
      syncStatus.currentSpace = space.displayName;
      broadcastProgress({ ...syncStatus, spaces: syncedSpaces });

      try {
        // Fetch messages for this space
        console.log(`[Chat Sync] Fetching messages for space: ${space.displayName}`);
        const messages = await chatService.listAllMessages(space.name, maxMessagesPerSpace);

        // Convert messages to entities
        const spaceEntities = convertMessagesToEntities(messages, space);
        allEntities.push(...spaceEntities);

        syncStatus.messagesProcessed += messages.length;
        syncStatus.spacesProcessed++;

        // Add to synced spaces list
        syncedSpaces.push({
          name: space.name,
          displayName: space.displayName,
          type: space.spaceType,
          messageCount: messages.length,
        });

        broadcastProgress({ ...syncStatus, spaces: syncedSpaces });

        console.log(
          `[Chat Sync] Processed space "${space.displayName}": ${messages.length} messages, ${spaceEntities.length} entities`
        );
      } catch (error) {
        console.error(`[Chat Sync] Failed to process space ${space.displayName}:`, error);
        // Continue with other spaces
      }
    }

    console.log(`[Chat Sync] Converted to ${allEntities.length} entities total`);

    // Save entities to Weaviate
    if (allEntities.length > 0) {
      await saveEntities(allEntities, userId, 'chat-sync');
      console.log(`[Chat Sync] Saved ${allEntities.length} entities to Weaviate`);
    }

    syncStatus.isRunning = false;
    syncStatus.lastSync = new Date();
    syncStatus.currentSpace = undefined;

    broadcastProgress({ ...syncStatus, spaces: syncedSpaces });

    console.log(
      `[Chat Sync] Completed. Processed ${syncStatus.spacesProcessed} spaces, ${syncStatus.messagesProcessed} messages`
    );
  } catch (error) {
    console.error('[Chat Sync] Sync failed:', error);
    syncStatus.isRunning = false;
    syncStatus.error = error instanceof Error ? error.message : 'Unknown error';
    broadcastProgress({ ...syncStatus, spaces: syncedSpaces });
    throw error;
  }
}

/**
 * Convert Google Chat messages to Person entities
 */
function convertMessagesToEntities(messages: ChatMessage[], space: ChatSpace): Entity[] {
  const entities: Entity[] = [];
  const seenSenders = new Set<string>();

  for (const message of messages) {
    // Skip bot messages and messages without sender info
    if (message.sender.type === 'BOT' || !message.sender.name) {
      continue;
    }

    // Only create one entity per unique sender in this space
    const senderId = message.sender.name;
    if (seenSenders.has(senderId)) {
      continue;
    }
    seenSenders.add(senderId);

    // Create Person entity from message sender
    const personEntity: Entity = {
      type: 'person',
      value: message.sender.displayName,
      normalized: message.sender.displayName.toLowerCase().trim(),
      confidence: 0.85, // Slightly lower than contacts since these are from chat
      source: 'metadata',
      context: buildMessageContext(message, space),
    };

    entities.push(personEntity);
  }

  return entities;
}

/**
 * Build context string for person entity from chat message
 */
function buildMessageContext(message: ChatMessage, space: ChatSpace): string {
  const parts: string[] = [];

  // Add space info
  parts.push(`Chat space: ${space.displayName}`);

  // Add email if available
  if (message.sender.email) {
    parts.push(`Email: ${message.sender.email}`);
  }

  // Add message preview (first 100 chars of text)
  if (message.text) {
    const preview = message.text.slice(0, 100) + (message.text.length > 100 ? '...' : '');
    parts.push(`Recent message: "${preview}"`);
  }

  return parts.join(' | ');
}
