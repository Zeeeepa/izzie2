/**
 * OAuth Middleware for MCP HTTP Transport
 *
 * Validates Bearer tokens against better-auth sessions or API keys and extracts user context.
 * Implements OAuthTokenVerifier interface from MCP SDK.
 *
 * Token Types:
 * - Session tokens: From better-auth web sessions
 * - API keys: Format izz_* for programmatic access (Claude Desktop, claude-mpm)
 */

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { dbClient } from '@/lib/db';
import { sessions, users } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { validateApiKey, isApiKey } from '@/lib/auth/api-keys';

const LOG_PREFIX = '[MCP OAuth]';

/**
 * Token verification result with user context
 */
export interface TokenValidationResult {
  userId: string;
  authInfo: AuthInfo;
}

/**
 * Verifies a Bearer token against better-auth sessions
 *
 * @param token - The Bearer token to verify (session token from better-auth)
 * @returns AuthInfo if valid, throws error if invalid
 */
async function verifyBetterAuthSession(token: string): Promise<TokenValidationResult> {
  if (!dbClient.isConfigured()) {
    console.error(`${LOG_PREFIX} Database not configured`);
    throw new Error('Database not configured');
  }

  const db = dbClient.getDb();

  // Look up the session by token
  // better-auth stores session tokens in the sessions table
  const [session] = await db
    .select({
      sessionId: sessions.id,
      sessionToken: sessions.token,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.token, token),
        gt(sessions.expiresAt, new Date()) // Session must not be expired
      )
    )
    .limit(1);

  if (!session) {
    console.error(`${LOG_PREFIX} Invalid or expired session token`);
    throw new Error('Invalid or expired session token');
  }

  console.log(`${LOG_PREFIX} Validated session for user: ${session.userEmail || session.userId}`);

  // Build AuthInfo for MCP
  const authInfo: AuthInfo = {
    token,
    clientId: 'izzie-mcp', // MCP client identifier
    scopes: ['mcp:tools', 'email:read', 'email:write', 'tasks:manage', 'github:manage'],
    expiresAt: session.expiresAt ? Math.floor(session.expiresAt.getTime() / 1000) : undefined,
    extra: {
      userId: session.userId,
      userName: session.userName,
      userEmail: session.userEmail,
    },
  };

  return {
    userId: session.userId,
    authInfo,
  };
}

/**
 * Extract user ID from validated AuthInfo
 */
export function getUserIdFromAuthInfo(authInfo: AuthInfo): string {
  const userId = authInfo.extra?.userId;
  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID not found in auth info');
  }
  return userId;
}

/**
 * Verifies an API key and returns TokenValidationResult
 *
 * @param apiKey - The API key to verify (format: izz_*)
 * @returns TokenValidationResult if valid, throws error if invalid
 */
async function verifyApiKeyToken(apiKey: string): Promise<TokenValidationResult> {
  const result = await validateApiKey(apiKey);

  if (!result) {
    console.error(`${LOG_PREFIX} Invalid API key`);
    throw new Error('Invalid or expired API key');
  }

  console.log(`${LOG_PREFIX} Validated API key for user: ${result.userId}`);

  // Build AuthInfo for MCP
  const authInfo: AuthInfo = {
    token: apiKey,
    clientId: 'izzie-mcp-apikey', // Differentiate from session-based auth
    scopes: result.scopes,
    extra: {
      userId: result.userId,
      keyId: result.keyId,
      authMethod: 'api_key',
    },
  };

  return {
    userId: result.userId,
    authInfo,
  };
}

/**
 * OAuthTokenVerifier implementation for MCP SDK
 * Validates Bearer tokens against better-auth sessions or API keys
 */
export class BetterAuthTokenVerifier implements OAuthTokenVerifier {
  /**
   * Verify an access token and return auth info
   * Called by MCP SDK's requireBearerAuth middleware
   *
   * Supports two token types:
   * - API keys (format: izz_*) - for programmatic access
   * - Session tokens - from better-auth web sessions
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // Check if it's an API key
    if (isApiKey(token)) {
      const result = await verifyApiKeyToken(token);
      return result.authInfo;
    }

    // Otherwise validate as session token
    const result = await verifyBetterAuthSession(token);
    return result.authInfo;
  }
}

/**
 * Create a token verifier instance for use with MCP SDK
 */
export function createTokenVerifier(): OAuthTokenVerifier {
  return new BetterAuthTokenVerifier();
}

/**
 * Direct token validation function for custom middleware
 *
 * @param authorizationHeader - The Authorization header value (e.g., "Bearer <token>")
 * @returns Validation result with user ID and auth info
 */
export async function validateBearerToken(
  authorizationHeader: string | undefined
): Promise<TokenValidationResult> {
  if (!authorizationHeader) {
    throw new Error('Authorization header required');
  }

  if (!authorizationHeader.startsWith('Bearer ')) {
    throw new Error('Invalid authorization scheme, expected Bearer');
  }

  const token = authorizationHeader.slice(7).trim();

  if (!token) {
    throw new Error('Bearer token is empty');
  }

  // Check if it's an API key
  if (isApiKey(token)) {
    return verifyApiKeyToken(token);
  }

  // Otherwise validate as session token
  return verifyBetterAuthSession(token);
}

/**
 * OAuth Authorization Server Metadata
 * Per RFC 8414 / MCP spec
 */
export function getOAuthMetadata(baseUrl: string) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    scopes_supported: ['mcp:tools', 'email:read', 'email:write', 'tasks:manage', 'github:manage'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    service_documentation: `${baseUrl}/docs/mcp`,
    // MCP-specific extensions
    mcp_server: {
      name: 'izzie',
      version: '1.0.0',
      description: 'Izzie personal productivity assistant MCP server',
    },
  };
}
