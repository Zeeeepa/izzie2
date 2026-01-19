# Better Auth OAuth "unable_to_link_account" Fix

## Problem

OAuth authentication with Better Auth was failing with the error:
```
ERROR [Better Auth]: The field "accessTokenExpiresAt" does not exist in the "account" Drizzle schema.
ERROR [Better Auth]: unable_to_link_account
```

## Root Cause

The `accounts` table schema in `/src/lib/db/schema.ts` had a single `expiresAt` field, but Better Auth expects two separate timestamp fields:
- `accessTokenExpiresAt` - for access token expiration
- `refreshTokenExpiresAt` - for refresh token expiration

### Schema Mismatch

**Before (Incorrect):**
```typescript
export const accounts = pgTable('accounts', {
  // ... other fields ...
  expiresAt: timestamp('expires_at'),
  // ... other fields ...
});
```

**After (Correct):**
```typescript
export const accounts = pgTable('accounts', {
  // ... other fields ...
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  // ... other fields ...
});
```

## Solution

### 1. Updated Drizzle Schema

Modified `/src/lib/db/schema.ts` to match Better Auth's expected schema:
- Replaced `expiresAt` with `accessTokenExpiresAt`
- Added `refreshTokenExpiresAt` field

### 2. Database Migration

Created and ran migration scripts to update the database:

**Scripts Created:**
- `/scripts/fix-accounts-schema.ts` - Adds the new columns
- `/scripts/cleanup-old-expires-at.ts` - Removes the old `expires_at` column

**Migration Steps:**
```bash
npx tsx /scripts/fix-accounts-schema.ts
npx tsx /scripts/cleanup-old-expires-at.ts
```

### 3. Final Database Schema

The `accounts` table now has:
- `id` (text, primary key)
- `user_id` (text, references users.id)
- `account_id` (text) - Provider's user ID
- `provider_id` (text) - e.g., 'google'
- `access_token` (text, nullable)
- `refresh_token` (text, nullable)
- `id_token` (text, nullable)
- **`access_token_expires_at` (timestamp, nullable)** ✅ NEW
- **`refresh_token_expires_at` (timestamp, nullable)** ✅ NEW
- `scope` (text, nullable)
- `password` (text, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

## Verification

To verify the fix:
1. Navigate to http://localhost:3300/login
2. Click "Sign in with Google"
3. Complete the OAuth flow
4. Check that the account is successfully linked without errors

## References

- [Better Auth Drizzle Adapter Documentation](https://www.better-auth.com/docs/adapters/drizzle)
- [Better Auth Database Schema Documentation](https://www.better-auth.com/docs/concepts/database)
- Better Auth version: 1.4.10

## Related Files

- `/src/lib/db/schema.ts` - Updated schema definition
- `/scripts/fix-accounts-schema.ts` - Migration script
- `/scripts/cleanup-old-expires-at.ts` - Cleanup script
- `/drizzle/migrations/0007_fix_accounts_schema.sql` - Manual migration file

## Date

January 6, 2026
