/**
 * Better Auth Configuration
 * Server-side authentication setup with Google OAuth and Drizzle adapter
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { dbClient } from '@/lib/db';
import { users, sessions, accounts, verifications, accountMetadata } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Better Auth instance (lazy-initialized for build compatibility)
 * Configured with:
 * - Google OAuth provider with Calendar API scopes
 * - Neon Postgres via Drizzle adapter
 * - Session management
 */
let _auth: ReturnType<typeof betterAuth> | null = null;

function getAuth(): ReturnType<typeof betterAuth> | null {
  if (!_auth) {
    // Check if database is configured (prevents build-time errors)
    if (!dbClient.isConfigured()) {
      console.warn('[Auth] DATABASE_URL not configured - auth unavailable at build time');
      return null;
    }

    _auth = betterAuth({
      database: drizzleAdapter(dbClient.getDb(), {
        provider: 'pg',
        schema: {
          user: users,
          session: sessions,
          account: accounts,
          verification: verifications,
        },
      }),

      // Email and password authentication (optional, can be disabled)
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false, // Set to true in production
      },

      // Social providers
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID || '',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
          // Request Calendar, Gmail, Tasks, Drive, and Contacts API scopes
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/tasks',
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/contacts.readonly',
          ],
          // Request offline access to get refresh token
          accessType: 'offline',
          prompt: 'consent',
        },
      },

      // Session configuration
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day - update session if older than this
        cookieCache: {
          enabled: true,
          maxAge: 5 * 60, // Cache session for 5 minutes
        },
      },

      // Security settings
      advanced: {
        cookiePrefix: 'izzie2',
        crossSubDomainCookies: {
          enabled: false, // Set to true if using subdomains
        },
        useSecureCookies: process.env.NODE_ENV === 'production',
        generateId: false, // Use database-generated IDs
        // Disable origin check in development (CSRF protection reduced)
        disableOriginCheck: process.env.NODE_ENV !== 'production',
      },

      // Base URL for redirects
      baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300',

      // Secret for signing tokens
      secret: process.env.BETTER_AUTH_SECRET || '',
    });
  }
  return _auth;
}

// Export as a getter for backward compatibility
// The Proxy needs 'has' trap for `"handler" in auth` checks used by toNextJsHandler
export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
  get(_, prop) {
    const authInstance = getAuth();
    if (!authInstance) {
      // Handle auth API calls gracefully when database not configured
      if (prop === 'api') {
        return new Proxy({}, {
          get(_, apiProp) {
            return () => Promise.resolve(null);
          }
        });
      }
      // Handle Next.js route handler - return 503 instead of crashing
      if (prop === 'handler') {
        return async () => new Response(
          JSON.stringify({ error: 'Auth unavailable - database not configured' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return undefined;
    }
    return (authInstance as Record<string, unknown>)[prop as string];
  },
  // Required for toNextJsHandler which uses "handler" in auth check
  has(_, prop) {
    // Always report 'handler' as present - we handle the fallback in get()
    if (prop === 'handler') {
      return true;
    }
    const authInstance = getAuth();
    if (!authInstance) {
      return false;
    }
    return prop in authInstance;
  },
});

/**
 * Type-safe auth session type
 */
export type AuthSession = typeof auth.$Infer.Session;

/**
 * Helper to get session from request
 * @param request - Next.js request object
 * @returns Session or null if not authenticated
 */
export async function getSession(request: Request): Promise<AuthSession | null> {
  return await auth.api.getSession({ headers: request.headers });
}

/**
 * Helper to require authentication
 * Throws error if not authenticated
 */
export async function requireAuth(request: Request): Promise<AuthSession> {
  const session = await getSession(request);

  if (!session) {
    throw new Error('Unauthorized - authentication required');
  }

  return session;
}

/**
 * Helper to get Google OAuth tokens for a user
 * Used for accessing Google Calendar API
 *
 * @param userId - The user ID to get tokens for
 * @param accountId - Optional specific account ID. If not provided, returns primary or first account.
 * @returns Token information or null if database not configured
 */
export async function getGoogleTokens(
  userId: string,
  accountId?: string
): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  accountId: string;
} | null> {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot get Google tokens');
    return null;
  }

  const db = dbClient.getDb();

  // If specific account requested, get that one
  if (accountId) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.providerId, 'google'),
          eq(accounts.id, accountId)
        )
      )
      .limit(1);

    if (!account) {
      throw new Error('Google account not found');
    }

    return {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      refreshTokenExpiresAt: account.refreshTokenExpiresAt,
      scope: account.scope,
      accountId: account.id,
    };
  }

  // No accountId specified - try to get primary account first
  const [primaryAccount] = await db
    .select({
      id: accounts.id,
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
      accessTokenExpiresAt: accounts.accessTokenExpiresAt,
      refreshTokenExpiresAt: accounts.refreshTokenExpiresAt,
      scope: accounts.scope,
      isPrimary: accountMetadata.isPrimary,
    })
    .from(accounts)
    .leftJoin(accountMetadata, eq(accounts.id, accountMetadata.accountId))
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
    .orderBy(desc(accountMetadata.isPrimary))
    .limit(1);

  if (!primaryAccount) {
    throw new Error('No Google account linked to this user');
  }

  return {
    accessToken: primaryAccount.accessToken,
    refreshToken: primaryAccount.refreshToken,
    accessTokenExpiresAt: primaryAccount.accessTokenExpiresAt,
    refreshTokenExpiresAt: primaryAccount.refreshTokenExpiresAt,
    scope: primaryAccount.scope,
    accountId: primaryAccount.id,
  };
}

/**
 * Update Google OAuth tokens in database
 * Called when OAuth2Client auto-refreshes tokens
 */
export async function updateGoogleTokens(
  userId: string,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  }
): Promise<void> {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot update Google tokens');
    return;
  }
  const db = dbClient.getDb();

  // Build update object with only provided tokens
  const updateData: Partial<typeof accounts.$inferInsert> = {};

  if (tokens.access_token) {
    updateData.accessToken = tokens.access_token;
  }

  if (tokens.refresh_token) {
    updateData.refreshToken = tokens.refresh_token;
  }

  if (tokens.expiry_date) {
    updateData.accessTokenExpiresAt = new Date(tokens.expiry_date);
  }

  // Update the account record
  await db
    .update(accounts)
    .set({
      ...updateData,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')));

  console.log('[Auth] Updated Google OAuth tokens for user:', userId);
}

/**
 * Get all Google accounts for a user
 * Returns accounts with their metadata (label, isPrimary, accountEmail)
 */
export async function getAllGoogleAccounts(userId: string) {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot get Google accounts');
    return [];
  }

  const db = dbClient.getDb();

  const userAccounts = await db
    .select({
      id: accounts.id,
      providerId: accounts.providerId,
      accountId: accounts.accountId,
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
      accessTokenExpiresAt: accounts.accessTokenExpiresAt,
      scope: accounts.scope,
      createdAt: accounts.createdAt,
      // Metadata fields (may be null if no metadata record exists)
      label: accountMetadata.label,
      isPrimary: accountMetadata.isPrimary,
      accountEmail: accountMetadata.accountEmail,
    })
    .from(accounts)
    .leftJoin(accountMetadata, eq(accounts.id, accountMetadata.accountId))
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
    .orderBy(desc(accountMetadata.isPrimary), desc(accounts.createdAt));

  return userAccounts;
}

/**
 * Get account metadata for a user's accounts
 */
export async function getAccountMetadata(userId: string) {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot get account metadata');
    return [];
  }

  const db = dbClient.getDb();

  const metadata = await db
    .select()
    .from(accountMetadata)
    .where(eq(accountMetadata.userId, userId));

  return metadata;
}

/**
 * Set an account as primary for a user
 * Unsets all other accounts as non-primary first
 */
export async function setPrimaryAccount(
  userId: string,
  accountId: string
): Promise<void> {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot set primary account');
    return;
  }

  const db = dbClient.getDb();

  // First, unset all other accounts as primary for this user
  await db
    .update(accountMetadata)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(eq(accountMetadata.userId, userId));

  // Then set the specified account as primary
  // Check if metadata record exists
  const [existing] = await db
    .select({ id: accountMetadata.id })
    .from(accountMetadata)
    .where(
      and(
        eq(accountMetadata.userId, userId),
        eq(accountMetadata.accountId, accountId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(accountMetadata)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(
        and(
          eq(accountMetadata.userId, userId),
          eq(accountMetadata.accountId, accountId)
        )
      );
  } else {
    // Create metadata record if it doesn't exist
    await db.insert(accountMetadata).values({
      accountId,
      userId,
      isPrimary: true,
      label: 'primary',
    });
  }

  console.log('[Auth] Set primary account for user:', userId, 'account:', accountId);
}

/**
 * Get primary Google account for a user (or first one if none marked primary)
 */
export async function getPrimaryGoogleAccount(userId: string) {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot get primary Google account');
    return null;
  }

  const db = dbClient.getDb();

  // Try to get primary account via metadata
  const [primary] = await db
    .select({
      id: accounts.id,
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
      accessTokenExpiresAt: accounts.accessTokenExpiresAt,
      scope: accounts.scope,
      accountEmail: accountMetadata.accountEmail,
      label: accountMetadata.label,
      isPrimary: accountMetadata.isPrimary,
    })
    .from(accounts)
    .leftJoin(accountMetadata, eq(accounts.id, accountMetadata.accountId))
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.providerId, 'google'),
        eq(accountMetadata.isPrimary, true)
      )
    )
    .limit(1);

  if (primary) return primary;

  // Fall back to first Google account
  const [first] = await db
    .select({
      id: accounts.id,
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
      accessTokenExpiresAt: accounts.accessTokenExpiresAt,
      scope: accounts.scope,
      accountEmail: accountMetadata.accountEmail,
      label: accountMetadata.label,
      isPrimary: accountMetadata.isPrimary,
    })
    .from(accounts)
    .leftJoin(accountMetadata, eq(accounts.id, accountMetadata.accountId))
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
    .limit(1);

  return first || null;
}

/**
 * Update account metadata (label, email)
 */
export async function updateAccountMetadata(
  userId: string,
  accountId: string,
  updates: { label?: string; accountEmail?: string }
): Promise<void> {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot update account metadata');
    return;
  }

  const db = dbClient.getDb();

  // Check if metadata record exists
  const [existing] = await db
    .select({ id: accountMetadata.id })
    .from(accountMetadata)
    .where(
      and(
        eq(accountMetadata.userId, userId),
        eq(accountMetadata.accountId, accountId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(accountMetadata)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(accountMetadata.accountId, accountId));
  } else {
    // Create metadata record if it doesn't exist
    await db.insert(accountMetadata).values({
      accountId,
      userId,
      ...updates,
    });
  }

  console.log('[Auth] Updated account metadata for account:', accountId);
}

/**
 * Ensure account metadata exists for all Google accounts
 * Creates metadata records for any accounts missing them
 */
export async function ensureAccountMetadata(userId: string): Promise<void> {
  if (!dbClient.isConfigured()) {
    console.warn('[Auth] DATABASE_URL not configured - cannot ensure account metadata');
    return;
  }

  const db = dbClient.getDb();

  // Get all Google accounts for user
  const googleAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')));

  // Get existing metadata
  const existingMetadata = await db
    .select({ accountId: accountMetadata.accountId })
    .from(accountMetadata)
    .where(eq(accountMetadata.userId, userId));

  const existingAccountIds = new Set(existingMetadata.map((m) => m.accountId));

  // Create metadata for accounts that don't have it
  const accountsNeedingMetadata = googleAccounts.filter(
    (account) => !existingAccountIds.has(account.id)
  );

  if (accountsNeedingMetadata.length === 0) {
    return;
  }

  // Check if user already has a primary account
  const [hasPrimary] = await db
    .select({ id: accountMetadata.id })
    .from(accountMetadata)
    .where(
      and(eq(accountMetadata.userId, userId), eq(accountMetadata.isPrimary, true))
    )
    .limit(1);

  // Insert metadata for new accounts
  // First one becomes primary if no primary exists
  for (let i = 0; i < accountsNeedingMetadata.length; i++) {
    const account = accountsNeedingMetadata[i];
    const isFirstAndNoPrimary = i === 0 && !hasPrimary;

    await db.insert(accountMetadata).values({
      accountId: account.id,
      userId,
      isPrimary: isFirstAndNoPrimary,
      label: isFirstAndNoPrimary ? 'primary' : 'account',
    });
  }

  console.log(
    '[Auth] Created metadata for',
    accountsNeedingMetadata.length,
    'accounts for user:',
    userId
  );
}
