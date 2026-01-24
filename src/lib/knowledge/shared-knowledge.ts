/**
 * Shared Knowledge CRUD Operations
 *
 * Manages global and organization-scoped knowledge in PostgreSQL.
 * This is the "core/shared" tier of the two-tier knowledge architecture.
 */

import { eq, and, isNull, sql } from 'drizzle-orm';
import { dbClient } from '../db';
import {
  sharedKnowledge,
  organizations,
  type SharedKnowledge,
  type NewSharedKnowledge,
  type SharedKnowledgeType,
  SHARED_KNOWLEDGE_VISIBILITY,
} from '../db/schema';

const LOG_PREFIX = '[SharedKnowledge]';

/**
 * Get all global (core) knowledge
 * Global knowledge has organizationId = null and visibility = 'global'
 */
export async function getGlobalKnowledge(type?: SharedKnowledgeType): Promise<SharedKnowledge[]> {
  const db = dbClient.getDb();

  console.log(`${LOG_PREFIX} Fetching global knowledge${type ? ` (type: ${type})` : ''}`);

  const conditions = [
    isNull(sharedKnowledge.organizationId),
    eq(sharedKnowledge.visibility, SHARED_KNOWLEDGE_VISIBILITY.GLOBAL),
  ];

  if (type) {
    conditions.push(eq(sharedKnowledge.type, type));
  }

  const results = await db
    .select()
    .from(sharedKnowledge)
    .where(and(...conditions))
    .orderBy(sql`${sharedKnowledge.updatedAt} DESC`);

  console.log(`${LOG_PREFIX} Found ${results.length} global knowledge items`);
  return results;
}

/**
 * Get organization-scoped knowledge
 * Returns knowledge belonging to a specific organization
 */
export async function getOrganizationKnowledge(
  orgId: string,
  type?: SharedKnowledgeType
): Promise<SharedKnowledge[]> {
  const db = dbClient.getDb();

  console.log(`${LOG_PREFIX} Fetching knowledge for organization ${orgId}${type ? ` (type: ${type})` : ''}`);

  const conditions = [eq(sharedKnowledge.organizationId, orgId)];

  if (type) {
    conditions.push(eq(sharedKnowledge.type, type));
  }

  const results = await db
    .select()
    .from(sharedKnowledge)
    .where(and(...conditions))
    .orderBy(sql`${sharedKnowledge.updatedAt} DESC`);

  console.log(`${LOG_PREFIX} Found ${results.length} organization knowledge items`);
  return results;
}

/**
 * Get a single shared knowledge item by ID
 */
export async function getSharedKnowledgeById(id: string): Promise<SharedKnowledge | null> {
  const db = dbClient.getDb();

  const results = await db.select().from(sharedKnowledge).where(eq(sharedKnowledge.id, id)).limit(1);

  return results[0] || null;
}

/**
 * Create a new shared knowledge item
 */
export async function createSharedKnowledge(data: NewSharedKnowledge): Promise<SharedKnowledge> {
  const db = dbClient.getDb();

  console.log(`${LOG_PREFIX} Creating shared knowledge: "${data.title}" (type: ${data.type})`);

  const results = await db.insert(sharedKnowledge).values(data).returning();

  const created = results[0];
  console.log(`${LOG_PREFIX} Created shared knowledge with ID: ${created.id}`);
  return created;
}

/**
 * Update an existing shared knowledge item
 */
export async function updateSharedKnowledge(
  id: string,
  data: Partial<Omit<SharedKnowledge, 'id' | 'createdAt'>>
): Promise<SharedKnowledge> {
  const db = dbClient.getDb();

  console.log(`${LOG_PREFIX} Updating shared knowledge: ${id}`);

  const results = await db
    .update(sharedKnowledge)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(sharedKnowledge.id, id))
    .returning();

  if (results.length === 0) {
    throw new Error(`Shared knowledge with ID ${id} not found`);
  }

  console.log(`${LOG_PREFIX} Updated shared knowledge: ${id}`);
  return results[0];
}

/**
 * Delete a shared knowledge item
 */
export async function deleteSharedKnowledge(id: string): Promise<void> {
  const db = dbClient.getDb();

  console.log(`${LOG_PREFIX} Deleting shared knowledge: ${id}`);

  const result = await db.delete(sharedKnowledge).where(eq(sharedKnowledge.id, id));

  console.log(`${LOG_PREFIX} Deleted shared knowledge: ${id}`);
}

/**
 * Search shared knowledge by query
 * Simple text search using PostgreSQL ILIKE
 */
export async function searchSharedKnowledge(
  query: string,
  options?: {
    organizationId?: string | null; // null = global only, string = specific org
    type?: SharedKnowledgeType;
    limit?: number;
  }
): Promise<SharedKnowledge[]> {
  const db = dbClient.getDb();
  const limit = options?.limit || 20;

  console.log(`${LOG_PREFIX} Searching shared knowledge: "${query}"`);

  // Build conditions
  const conditions = [];

  // Organization filter
  if (options?.organizationId === null) {
    conditions.push(isNull(sharedKnowledge.organizationId));
  } else if (options?.organizationId) {
    conditions.push(eq(sharedKnowledge.organizationId, options.organizationId));
  }

  // Type filter
  if (options?.type) {
    conditions.push(eq(sharedKnowledge.type, options.type));
  }

  // Text search on title and content
  const searchPattern = `%${query}%`;
  conditions.push(
    sql`(${sharedKnowledge.title} ILIKE ${searchPattern} OR ${sharedKnowledge.content} ILIKE ${searchPattern})`
  );

  const results = await db
    .select()
    .from(sharedKnowledge)
    .where(and(...conditions))
    .orderBy(sql`${sharedKnowledge.updatedAt} DESC`)
    .limit(limit);

  console.log(`${LOG_PREFIX} Found ${results.length} matching items`);
  return results;
}

/**
 * Get all knowledge accessible to an organization (global + org-specific)
 */
export async function getAllAccessibleKnowledge(
  orgId: string,
  type?: SharedKnowledgeType
): Promise<SharedKnowledge[]> {
  const db = dbClient.getDb();

  console.log(`${LOG_PREFIX} Fetching all accessible knowledge for org ${orgId}`);

  // Build the base condition: global OR belongs to this org
  const accessCondition = sql`(
    (${sharedKnowledge.organizationId} IS NULL AND ${sharedKnowledge.visibility} = ${SHARED_KNOWLEDGE_VISIBILITY.GLOBAL})
    OR ${sharedKnowledge.organizationId} = ${orgId}
  )`;

  const conditions = [accessCondition];

  if (type) {
    conditions.push(eq(sharedKnowledge.type, type));
  }

  const results = await db
    .select()
    .from(sharedKnowledge)
    .where(and(...conditions))
    .orderBy(sql`${sharedKnowledge.updatedAt} DESC`);

  console.log(`${LOG_PREFIX} Found ${results.length} accessible knowledge items`);
  return results;
}
