# OAuth Token Refresh Fix

## Problem
The extraction start API was failing with "Authentication required" when trying to start email extraction from the dashboard. The issue was that expired OAuth tokens weren't being automatically refreshed.

## Root Cause
Three locations in the codebase were using the OAuth2Client's auto-refresh feature but had TODO comments indicating tokens weren't being saved back to the database:

1. `src/lib/calendar/index.ts` - Calendar client (line 51-54)
2. `src/app/api/gmail/sync-user/route.ts` - Gmail sync client (line 60-63)
3. `src/lib/auth/index.ts` - No token update helper existed

When tokens expired, the OAuth2Client would refresh them automatically, but the new tokens weren't persisted to the `accounts` table in the database. This meant subsequent requests would still use the expired tokens.

## Solution

### 1. Created Token Update Helper (`src/lib/auth/index.ts`)
Added `updateGoogleTokens()` function to update OAuth tokens in the database:

```typescript
export async function updateGoogleTokens(
  userId: string,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  }
): Promise<void> {
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
```

### 2. Updated Calendar Client (`src/lib/calendar/index.ts`)
Changed the token refresh handler from TODO to actual implementation:

```typescript
// Before
oauth2Client.on('tokens', async (newTokens) => {
  console.log('[Calendar] Tokens refreshed for user:', userId);
  // TODO: Update tokens in database
});

// After
oauth2Client.on('tokens', async (newTokens) => {
  console.log('[Calendar] Tokens refreshed for user:', userId);
  await updateGoogleTokens(userId, newTokens);
});
```

### 3. Updated Gmail Sync Client (`src/app/api/gmail/sync-user/route.ts`)
Changed the token refresh handler from TODO to actual implementation:

```typescript
// Before
oauth2Client.on('tokens', async (newTokens) => {
  console.log('[Gmail Sync User] Tokens refreshed for user:', userId);
  // TODO: Update tokens in database (same as calendar)
});

// After
oauth2Client.on('tokens', async (newTokens) => {
  console.log('[Gmail Sync User] Tokens refreshed for user:', userId);
  await updateGoogleTokens(userId, newTokens);
});
```

## How It Works

1. **User Clicks "Start Extraction"** → `POST /api/extraction/start`
2. **Extraction API Forwards Request** → Calls `/api/gmail/sync-user` with auth cookies
3. **Gmail Sync Gets User Tokens** → Calls `getGoogleTokens(userId)` to fetch from database
4. **OAuth2Client Initialized** → Sets up with `access_token`, `refresh_token`, and `expiry_date`
5. **Auto-Refresh Triggered** → If token is expired, OAuth2Client automatically refreshes
6. **Tokens Event Fires** → OAuth2Client emits 'tokens' event with new credentials
7. **Database Updated** → `updateGoogleTokens()` persists new tokens to `accounts` table
8. **Extraction Proceeds** → Sync continues with valid tokens

## Database Schema
The `accounts` table stores OAuth tokens:

```typescript
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(), // 'google'
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

## Testing

To verify the fix works:

1. **Find a user with expired tokens**:
   ```sql
   SELECT * FROM accounts
   WHERE provider_id = 'google'
   AND access_token_expires_at < NOW();
   ```

2. **Start extraction from dashboard**:
   - Navigate to `/dashboard/extraction`
   - Click "Start Extraction" for email
   - Should succeed instead of "Authentication required"

3. **Check logs for token refresh**:
   ```
   [Gmail Sync User] Tokens refreshed for user: <userId>
   [Auth] Updated Google OAuth tokens for user: <userId>
   ```

4. **Verify database updated**:
   ```sql
   SELECT access_token_expires_at, updated_at
   FROM accounts
   WHERE user_id = '<userId>' AND provider_id = 'google';
   ```
   The `access_token_expires_at` should be in the future and `updated_at` should be recent.

## Files Modified

1. **src/lib/auth/index.ts**
   - Added `updateGoogleTokens()` helper function
   - +35 lines

2. **src/lib/calendar/index.ts**
   - Imported `updateGoogleTokens` from auth
   - Updated token refresh handler to call `updateGoogleTokens()`
   - -2 lines (removed TODO comments)

3. **src/app/api/gmail/sync-user/route.ts**
   - Imported `updateGoogleTokens` from auth
   - Updated token refresh handler to call `updateGoogleTokens()`
   - -1 line (removed TODO comment)

## Impact

### Before Fix
- Extraction would fail if user's OAuth tokens expired
- Users would see "Authentication required" error
- Manual re-authentication required to get new tokens
- Poor UX - users couldn't understand why extraction suddenly stopped working

### After Fix
- OAuth tokens automatically refresh when expired
- New tokens persisted to database immediately
- Extraction continues seamlessly
- Users don't experience authentication failures
- Better UX - extraction "just works"

## Related Code Patterns

This same pattern should be applied anywhere we use Google OAuth:
- ✅ Calendar API (`src/lib/calendar/index.ts`)
- ✅ Gmail API (`src/app/api/gmail/sync-user/route.ts`)
- ⚠️ Drive API (not yet implemented)
- ⚠️ Tasks API (uses old next-auth - needs migration)

## Future Improvements

1. **Proactive Token Refresh**: Check expiry before API calls and refresh if < 5 minutes remaining
2. **Token Refresh Failures**: Better error handling if refresh token is revoked
3. **Multi-Provider Support**: Extend `updateGoogleTokens()` to support other OAuth providers
4. **Token Rotation**: Track token refresh history for security audit
