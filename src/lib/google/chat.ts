/**
 * Google Chat Service
 * Provides methods to interact with Google Chat API
 */

import { google, Auth, chat_v1 } from 'googleapis';

// Re-export types from google types file
export interface ChatSpace {
  name: string; // Space resource name (e.g., "spaces/AAAAAAAAAAA")
  displayName: string;
  type: 'ROOM' | 'DM' | 'SPACE' | 'GROUP_CHAT' | 'TYPE_UNSPECIFIED';
  spaceType: 'SPACE' | 'GROUP_CHAT' | 'DIRECT_MESSAGE' | 'SPACE_TYPE_UNSPECIFIED';
  singleUserBotDm: boolean;
  threaded: boolean;
  externalUserAllowed: boolean;
  spaceHistoryState?: 'HISTORY_ON' | 'HISTORY_OFF' | 'HISTORY_STATE_UNSPECIFIED';
  createTime?: string;
}

export interface ChatMessage {
  name: string; // Message resource name
  sender: {
    name: string; // User resource name
    displayName: string;
    email?: string;
    domainId?: string;
    type: 'HUMAN' | 'BOT' | 'TYPE_UNSPECIFIED';
  };
  createTime: string;
  lastUpdateTime?: string;
  text?: string;
  formattedText?: string;
  threadReply?: boolean;
  thread?: {
    name: string;
    threadKey?: string;
  };
  space?: {
    name: string;
    displayName?: string;
  };
  attachments?: Array<{
    name: string;
    contentName: string;
    contentType: string;
    downloadUri?: string;
  }>;
}

export interface ChatSyncStatus {
  isRunning: boolean;
  spacesProcessed: number;
  messagesProcessed: number;
  totalSpaces: number;
  currentSpace?: string;
  lastSync?: Date;
  error?: string;
  startedAt?: Date;
}

export class ChatService {
  private chat: chat_v1.Chat;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.chat = google.chat({ version: 'v1', auth });
  }

  /**
   * List all Chat spaces the user has access to
   */
  async listSpaces(options: {
    pageSize?: number;
    pageToken?: string;
    filter?: string;
  } = {}): Promise<{
    spaces: ChatSpace[];
    nextPageToken?: string;
  }> {
    const { pageSize = 100, pageToken, filter } = options;

    try {
      const response = await this.chat.spaces.list({
        pageSize,
        pageToken,
        filter, // e.g., 'spaceType = "SPACE"' or 'spaceType = "GROUP_CHAT"'
      });

      const spaces: ChatSpace[] = (response.data.spaces || []).map((space) => ({
        name: space.name || '',
        displayName: space.displayName || space.name || 'Unnamed Space',
        type: (space.type || 'TYPE_UNSPECIFIED') as ChatSpace['type'],
        spaceType: (space.spaceType || 'SPACE_TYPE_UNSPECIFIED') as ChatSpace['spaceType'],
        singleUserBotDm: space.singleUserBotDm || false,
        threaded: space.threaded || false,
        externalUserAllowed: space.externalUserAllowed || false,
        spaceHistoryState: space.spaceHistoryState as ChatSpace['spaceHistoryState'],
        createTime: space.createTime || undefined,
      }));

      return {
        spaces,
        nextPageToken: response.data.nextPageToken || undefined,
      };
    } catch (error) {
      console.error('[Chat] Failed to list spaces:', error);
      throw error;
    }
  }

  /**
   * List all spaces with pagination
   */
  async listAllSpaces(): Promise<ChatSpace[]> {
    const allSpaces: ChatSpace[] = [];
    let pageToken: string | undefined;

    try {
      do {
        const batch = await this.listSpaces({ pageSize: 100, pageToken });
        allSpaces.push(...batch.spaces);
        pageToken = batch.nextPageToken;

        console.log(`[Chat] Fetched ${allSpaces.length} spaces so far...`);
      } while (pageToken);

      console.log(`[Chat] Total spaces fetched: ${allSpaces.length}`);
      return allSpaces;
    } catch (error) {
      console.error('[Chat] Failed to list all spaces:', error);
      throw error;
    }
  }

  /**
   * List messages in a specific space
   */
  async listMessages(
    spaceId: string,
    options: {
      pageSize?: number;
      pageToken?: string;
      filter?: string;
      orderBy?: string;
      showDeleted?: boolean;
    } = {}
  ): Promise<{
    messages: ChatMessage[];
    nextPageToken?: string;
  }> {
    const { pageSize = 100, pageToken, filter, orderBy, showDeleted = false } = options;

    try {
      // Ensure space name is properly formatted
      const spaceName = spaceId.startsWith('spaces/') ? spaceId : `spaces/${spaceId}`;

      const response = await this.chat.spaces.messages.list({
        parent: spaceName,
        pageSize,
        pageToken,
        filter,
        orderBy: orderBy || 'createTime desc',
        showDeleted,
      });

      const messages: ChatMessage[] = (response.data.messages || []).map((msg) => ({
        name: msg.name || '',
        sender: {
          name: msg.sender?.name || '',
          displayName: msg.sender?.displayName || 'Unknown',
          email: undefined, // Chat API doesn't always include email
          domainId: msg.sender?.domainId || undefined,
          type: (msg.sender?.type || 'TYPE_UNSPECIFIED') as ChatMessage['sender']['type'],
        },
        createTime: msg.createTime || '',
        lastUpdateTime: msg.lastUpdateTime || undefined,
        text: msg.text || undefined,
        formattedText: msg.formattedText || undefined,
        threadReply: msg.threadReply || false,
        thread: msg.thread ? {
          name: msg.thread.name || '',
          threadKey: msg.thread.threadKey || undefined,
        } : undefined,
        space: msg.space ? {
          name: msg.space.name || '',
          displayName: msg.space.displayName || undefined,
        } : undefined,
        attachments: msg.attachment?.map((att) => ({
          name: att.name || '',
          contentName: att.contentName || '',
          contentType: att.contentType || '',
          downloadUri: att.downloadUri || undefined,
        })) || [],
      }));

      return {
        messages,
        nextPageToken: response.data.nextPageToken || undefined,
      };
    } catch (error) {
      console.error(`[Chat] Failed to list messages for space ${spaceId}:`, error);
      throw error;
    }
  }

  /**
   * List all messages in a space with pagination
   */
  async listAllMessages(
    spaceId: string,
    maxMessages: number = 1000
  ): Promise<ChatMessage[]> {
    const allMessages: ChatMessage[] = [];
    let pageToken: string | undefined;
    let fetched = 0;

    try {
      do {
        const batch = await this.listMessages(spaceId, {
          pageSize: Math.min(100, maxMessages - fetched),
          pageToken,
        });

        allMessages.push(...batch.messages);
        fetched += batch.messages.length;
        pageToken = batch.nextPageToken;

        console.log(`[Chat] Fetched ${fetched} messages from space so far...`);

        // Stop if we've reached max messages
        if (fetched >= maxMessages) {
          break;
        }
      } while (pageToken);

      console.log(`[Chat] Total messages fetched from space: ${allMessages.length}`);
      return allMessages;
    } catch (error) {
      console.error(`[Chat] Failed to list all messages for space ${spaceId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific space by ID
   */
  async getSpace(spaceId: string): Promise<ChatSpace | null> {
    try {
      const spaceName = spaceId.startsWith('spaces/') ? spaceId : `spaces/${spaceId}`;
      const response = await this.chat.spaces.get({ name: spaceName });

      const space = response.data;
      return {
        name: space.name || '',
        displayName: space.displayName || space.name || 'Unnamed Space',
        type: (space.type || 'TYPE_UNSPECIFIED') as ChatSpace['type'],
        spaceType: (space.spaceType || 'SPACE_TYPE_UNSPECIFIED') as ChatSpace['spaceType'],
        singleUserBotDm: space.singleUserBotDm || false,
        threaded: space.threaded || false,
        externalUserAllowed: space.externalUserAllowed || false,
        spaceHistoryState: space.spaceHistoryState as ChatSpace['spaceHistoryState'],
        createTime: space.createTime || undefined,
      };
    } catch (error) {
      console.error(`[Chat] Failed to get space ${spaceId}:`, error);
      return null;
    }
  }
}

/**
 * Factory function to create ChatService instance
 */
export async function getChatService(
  auth: Auth.GoogleAuth | Auth.OAuth2Client
): Promise<ChatService> {
  return new ChatService(auth);
}
