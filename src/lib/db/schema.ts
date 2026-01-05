/**
 * Database Schema for Neon Postgres with pgvector
 *
 * This schema defines tables for:
 * - Memory entries with vector embeddings (1536 dimensions)
 * - Users for session context
 * - Conversations for tracking
 *
 * Uses pgvector extension for semantic search capabilities.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  varchar,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Custom vector type for pgvector extension
 * Drizzle doesn't have built-in vector support, so we define it as a custom type
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns vectors as strings like "[0.1,0.2,0.3]"
    return JSON.parse(value.replace(/[\[\]]/g, (m) => (m === '[' ? '[' : ']')));
  },
});

/**
 * Users table
 * Tracks users and their preferences
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: text('name'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index('users_email_idx').on(table.email),
  })
);

/**
 * Conversations table
 * Tracks conversation sessions
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('conversations_user_id_idx').on(table.userId),
    createdAtIdx: index('conversations_created_at_idx').on(table.createdAt),
  })
);

/**
 * Memory entries table with vector embeddings
 * Stores semantic memory with pgvector for similarity search
 *
 * Vector dimension: 1536 (OpenAI text-embedding-3-small)
 */
export const memoryEntries = pgTable(
  'memory_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Content and metadata
    content: text('content').notNull(),
    summary: text('summary'),
    metadata: jsonb('metadata').$type<{
      source?: string;
      type?: string;
      tags?: string[];
      entities?: Record<string, unknown>;
      [key: string]: unknown;
    }>(),

    // Vector embedding (1536 dimensions for text-embedding-3-small)
    // Using pgvector extension - stored as vector type
    embedding: vector('embedding'),

    // Importance and relevance scoring
    importance: integer('importance').default(5), // 1-10 scale
    accessCount: integer('access_count').default(0),
    lastAccessedAt: timestamp('last_accessed_at'),

    // Soft delete support
    isDeleted: boolean('is_deleted').default(false),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Regular indexes
    userIdIdx: index('memory_entries_user_id_idx').on(table.userId),
    conversationIdIdx: index('memory_entries_conversation_id_idx').on(
      table.conversationId
    ),
    createdAtIdx: index('memory_entries_created_at_idx').on(table.createdAt),
    importanceIdx: index('memory_entries_importance_idx').on(table.importance),

    // Vector index for similarity search using IVFFlat
    // This will be created via migration SQL (not supported by Drizzle schema yet)
    // See migration file for: CREATE INDEX ON memory_entries USING ivfflat (embedding vector_cosine_ops)
  })
);

/**
 * Type exports for TypeScript
 */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type MemoryEntry = typeof memoryEntries.$inferSelect;
export type NewMemoryEntry = typeof memoryEntries.$inferInsert;
