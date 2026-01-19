# OAuth Testing Guide

## Problem Fixed
✅ Better Auth "unable_to_link_account" error - fixed by updating `accounts` table schema

## Changes Made

### 1. Database Schema (`src/lib/db/schema.ts`)
- **Changed:** `expiresAt` field → `accessTokenExpiresAt` and `refreshTokenExpiresAt`
- **Impact:** Matches Better Auth's expected schema

### 2. Database Migration
- **Script:** `/scripts/fix-accounts-schema.ts` - Added new columns
- **Script:** `/scripts/cleanup-old-expires-at.ts` - Removed old column
- **Status:** ✅ Applied successfully

### 3. Code Updates
- **File:** `/src/lib/auth/index.ts` - Updated `getGoogleTokens()` return type
- **File:** `/src/lib/calendar/index.ts` - Updated OAuth2 client credentials

## Testing Instructions

### 1. Start the Development Server
```bash
npm run dev
```
Server runs at: http://localhost:3300

### 2. Test Google OAuth Flow
1. Navigate to: http://localhost:3300/login
2. Click "Sign in with Google"
3. Complete Google OAuth authorization
4. Verify you're redirected back successfully
5. Check console for any errors

### 3. Verify Database
Check that the accounts table has the correct structure:
```bash
npx tsx scripts/verify-accounts-schema.ts
```

Or manually check in the database:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'accounts'
ORDER BY ordinal_position;
```

Expected columns:
- ✅ `access_token_expires_at` (timestamp)
- ✅ `refresh_token_expires_at` (timestamp)
- ❌ `expires_at` (should NOT exist anymore)

### 4. Test Calendar Integration
After successful OAuth login:
```bash
# Test Google Calendar API access
curl http://localhost:3300/api/calendar/list
```

## Expected Behavior

### Before Fix
```
ERROR [Better Auth]: The field "accessTokenExpiresAt" does not exist
ERROR [Better Auth]: unable_to_link_account
```

### After Fix
- ✅ OAuth flow completes successfully
- ✅ Account is linked to user
- ✅ Tokens are stored with proper expiration timestamps
- ✅ No errors in console

## Rollback (if needed)

If you need to rollback:
```bash
# Restore old schema (NOT RECOMMENDED - will break OAuth)
ALTER TABLE accounts RENAME COLUMN access_token_expires_at TO expires_at;
ALTER TABLE accounts DROP COLUMN refresh_token_expires_at;
```

## Related Files
- `/src/lib/db/schema.ts` - Schema definition
- `/src/lib/auth/index.ts` - Auth configuration
- `/src/lib/calendar/index.ts` - Calendar integration
- `/docs/fixes/better-auth-oauth-fix.md` - Detailed fix documentation
- `/scripts/fix-accounts-schema.ts` - Migration script
- `/scripts/cleanup-old-expires-at.ts` - Cleanup script

## Verification Checklist
- [ ] Database schema updated
- [ ] Old `expires_at` column removed
- [ ] New columns added: `access_token_expires_at`, `refresh_token_expires_at`
- [ ] Code references updated
- [ ] OAuth flow tested
- [ ] No errors in console
- [ ] Tokens stored correctly

## Date
January 6, 2026
