/**
 * API Key Management for MCP Server Authentication
 *
 * Provides functions to generate, validate, and revoke API keys
 * for connecting Claude Desktop or claude-mpm to Izzie's MCP server.
 *
 * Security:
 * - Keys are never stored in plain text - only SHA-256 hashes
 * - Keys have format: izz_{32 random alphanumeric chars}
 * - Keys can have expiration dates
 * - Keys can be revoked without deletion (audit trail)
 */

import { dbClient } from '@/lib/db';
import { apiKeys, users } from '@/lib/db/schema';
import { eq, and, isNull, or, gt } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';

const LOG_PREFIX = '[API Keys]';

/**
 * API Key prefix for identification
 */
const API_KEY_PREFIX = 'izz_'; // pragma: allowlist secret

/**
 * Default scopes for MCP API keys
 */
const DEFAULT_SCOPES = ['mcp:read', 'mcp:write'];

/**
 * Maximum number of API keys per user
 */
const MAX_KEYS_PER_USER = 10;

/**
 * Result of API key generation
 */
export interface GenerateApiKeyResult {
  id: string;
  key: string; // Full key (only returned once on creation)
  keyPrefix: string;
  name: string;
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Result of API key validation
 */
export interface ValidateApiKeyResult {
  userId: string;
  scopes: string[];
  keyId: string;
}

/**
 * API key for display (without sensitive data)
 */
export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Generate a cryptographically secure random key
 * Format: izz_{32 alphanumeric chars}
 */
function generateSecureKey(): string {
  // Generate 24 random bytes and convert to base64url
  // This gives us 32 characters of random data
  const randomPart = randomBytes(24)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 32);

  return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Hash an API key using SHA-256
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Extract the prefix from a key for identification
 * Returns first 8 characters (izz_ + 4 chars)
 */
function extractKeyPrefix(key: string): string {
  return key.slice(0, 8);
}

/**
 * Generate a new API key for a user
 *
 * @param userId - The user ID to generate the key for
 * @param name - User-friendly name for the key (e.g., "Claude Desktop")
 * @param expiresInDays - Optional expiration in days (null = never expires)
 * @returns The generated key info (key is only returned once)
 */
export async function generateApiKey(
  userId: string,
  name: string,
  expiresInDays?: number
): Promise<GenerateApiKeyResult> {
  if (!dbClient.isConfigured()) {
    throw new Error('Database not configured');
  }

  const db = dbClient.getDb();

  // Check rate limit: max 10 keys per user
  const existingCount = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));

  if (existingCount.length >= MAX_KEYS_PER_USER) {
    throw new Error(`Maximum of ${MAX_KEYS_PER_USER} active API keys allowed per user`);
  }

  // Generate the key
  const key = generateSecureKey();
  const keyHash = hashApiKey(key);
  const keyPrefix = extractKeyPrefix(key);

  // Calculate expiration
  let expiresAt: Date | null = null;
  if (expiresInDays && expiresInDays > 0) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  }

  // Insert the key
  const [inserted] = await db
    .insert(apiKeys)
    .values({
      userId,
      name,
      keyHash,
      keyPrefix,
      scopes: DEFAULT_SCOPES,
      expiresAt,
    })
    .returning();

  console.log(`${LOG_PREFIX} Generated API key for user: ${userId}, name: ${name}`);

  return {
    id: inserted.id,
    key, // Only time the full key is returned
    keyPrefix: inserted.keyPrefix,
    name: inserted.name,
    scopes: inserted.scopes,
    expiresAt: inserted.expiresAt,
    createdAt: inserted.createdAt,
  };
}

/**
 * Validate an API key and return user info
 *
 * @param key - The full API key to validate
 * @returns User ID and scopes if valid, null if invalid
 */
export async function validateApiKey(key: string): Promise<ValidateApiKeyResult | null> {
  if (!dbClient.isConfigured()) {
    console.error(`${LOG_PREFIX} Database not configured`);
    return null;
  }

  // Check key format
  if (!key.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const db = dbClient.getDb();
  const keyHash = hashApiKey(key);

  // Find the key by hash
  const [found] = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      scopes: apiKeys.scopes,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!found) {
    console.log(`${LOG_PREFIX} API key not found`);
    return null;
  }

  // Check if revoked
  if (found.revokedAt) {
    console.log(`${LOG_PREFIX} API key has been revoked`);
    return null;
  }

  // Check if expired
  if (found.expiresAt && found.expiresAt < new Date()) {
    console.log(`${LOG_PREFIX} API key has expired`);
    return null;
  }

  // Update last used timestamp (fire and forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, found.id))
    .execute()
    .catch((err) => console.error(`${LOG_PREFIX} Failed to update lastUsedAt:`, err));

  console.log(`${LOG_PREFIX} API key validated for user: ${found.userId}`);

  return {
    userId: found.userId,
    scopes: found.scopes,
    keyId: found.id,
  };
}

/**
 * Revoke an API key (soft delete)
 *
 * @param keyId - The key ID to revoke
 * @param userId - The user ID (for authorization check)
 * @returns true if revoked, false if not found
 */
export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  if (!dbClient.isConfigured()) {
    throw new Error('Database not configured');
  }

  const db = dbClient.getDb();

  // Update the key to set revokedAt
  const result = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));

  const updated = result.rowCount ?? 0;

  if (updated > 0) {
    console.log(`${LOG_PREFIX} Revoked API key: ${keyId} for user: ${userId}`);
    return true;
  }

  console.log(`${LOG_PREFIX} API key not found or already revoked: ${keyId}`);
  return false;
}

/**
 * List all API keys for a user (without sensitive data)
 *
 * @param userId - The user ID to list keys for
 * @returns Array of key info (without hashes)
 */
export async function listApiKeys(userId: string): Promise<ApiKeyInfo[]> {
  if (!dbClient.isConfigured()) {
    throw new Error('Database not configured');
  }

  const db = dbClient.getDb();

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(apiKeys.createdAt);

  return keys;
}

/**
 * Check if a string is an API key (by prefix)
 */
export function isApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}
