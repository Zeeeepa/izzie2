# OAuth Gmail API Access Investigation Report

**Date:** 2026-01-06
**Investigator:** Research Agent
**Project:** izzie2

---

## Executive Summary

**Question:** Can the user's OAuth login tokens be used for Gmail API access?

**Answer:** **PARTIALLY - Gmail scope is MISSING from OAuth configuration**

The current OAuth implementation stores access tokens and refresh tokens correctly, but the OAuth scopes requested during login **do NOT include Gmail API access**. Users would need to re-authenticate to grant Gmail permissions.

---

## Detailed Findings

### 1. Database Schema Analysis

#### Accounts Table Structure (`/Users/masa/Projects/izzie2/src/lib/db/schema.ts`)

The `accounts` table is correctly configured to store OAuth tokens:

```typescript
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    accountId: text('account_id').notNull(), // Provider's user ID
    providerId: text('provider_id').notNull(), // e.g., 'google'
    accessToken: text('access_token'),        // ✅ PRESENT
    refreshToken: text('refresh_token'),      // ✅ PRESENT
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),                     // ✅ PRESENT - stores granted scopes
    // ... other fields
  }
);
```

**Status:** ✅ Schema supports storing OAuth tokens correctly.

---

### 2. OAuth Configuration Analysis

#### Current OAuth Scopes (`/Users/masa/Projects/izzie2/src/lib/auth/index.ts`)

The Better Auth configuration requests the following scopes:

```typescript
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar',           // ✅ Calendar
      'https://www.googleapis.com/auth/calendar.events',    // ✅ Calendar Events
    ],
    accessType: 'offline',
    prompt: 'consent',
  },
},
```

**Status:** ❌ **Gmail scopes are MISSING**

**Required Scope for Gmail API:** `https://www.googleapis.com/auth/gmail.readonly`

---

### 3. Gmail Integration Analysis

#### Gmail Service Account Authentication (`/Users/masa/Projects/izzie2/src/lib/google/auth.ts`)

The project has a **separate Gmail authentication mechanism** using Google Service Accounts:

```typescript
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',   // ✅ Correct scope
  'https://www.googleapis.com/auth/drive.readonly',
];

export async function getServiceAccountAuth(
  userEmail?: string
): Promise<Auth.GoogleAuth> {
  // Service account with domain-wide delegation
  // Requires GOOGLE_SERVICE_ACCOUNT_KEY_PATH
}
```

**Key Observations:**
- Service accounts are designed for **server-to-server** access
- Requires **domain-wide delegation** to impersonate users
- This is **NOT using the OAuth login tokens** from the `accounts` table
- Intended for workspace/enterprise Gmail accounts, not personal accounts

---

### 4. Current Gmail API Usage

#### Gmail Sync Endpoint (`/Users/masa/Projects/izzie2/src/app/api/gmail/sync/route.ts`)

The Gmail sync endpoint uses **service account authentication**, not OAuth tokens:

```typescript
// Get authentication
const auth = await getServiceAccountAuth(userEmail);
const gmailService = await getGmailService(auth);
```

**Status:** Currently uses service accounts, **not OAuth tokens from login**.

---

## Root Cause Analysis

### Why OAuth Tokens Can't Be Used for Gmail

1. **Missing Scope:** The OAuth configuration does not request `gmail.readonly` scope
2. **Separate Auth Paths:**
   - OAuth login → Calendar API access
   - Service account → Gmail API access
3. **No Helper for OAuth Gmail Access:** The `getGoogleTokens()` helper exists but returns tokens without Gmail scope

---

## Solution Options

### Option 1: Add Gmail Scope to OAuth Configuration (Recommended)

**Change Required:**

```typescript
// In /Users/masa/Projects/izzie2/src/lib/auth/index.ts
socialProviders: {
  google: {
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.readonly',  // ADD THIS
    ],
  },
}
```

**Impact:**
- ✅ Users can grant Gmail access during login
- ✅ Tokens stored in `accounts` table will include Gmail scope
- ✅ Can reuse OAuth tokens for Gmail API
- ⚠️ **Existing users must re-authenticate** to grant new permissions

**Implementation Steps:**
1. Update OAuth scope configuration
2. Update `getGoogleTokens()` helper to refresh tokens if expired
3. Create new Gmail service that uses OAuth tokens instead of service account
4. Prompt existing users to re-authorize

---

### Option 2: Keep Service Account for Gmail (Current Approach)

**Status Quo:**
- Continue using service accounts for Gmail access
- OAuth tokens only for Calendar API
- No changes needed

**Trade-offs:**
- ❌ Requires enterprise/workspace account with domain-wide delegation
- ❌ Cannot access personal Gmail accounts
- ❌ More complex setup (service account key management)
- ✅ Centralized access control
- ✅ No user re-authentication needed

---

### Option 3: Hybrid Approach

**Scenario:**
- Use OAuth tokens for **personal Gmail accounts**
- Use service accounts for **workspace/enterprise accounts**

**Implementation:**
1. Add Gmail scope to OAuth configuration
2. Detect account type (personal vs workspace)
3. Route to appropriate auth method

---

## Recommendations

### For Personal Gmail Access (Recommended)

**Add Gmail scope to OAuth configuration:**

```typescript
scope: [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',  // ADD
],
```

**Create OAuth-based Gmail service:**

```typescript
// New file: /Users/masa/Projects/izzie2/src/lib/google/gmail-oauth.ts
import { google } from 'googleapis';
import { getGoogleTokens } from '@/lib/auth';

export async function getGmailServiceWithOAuth(userId: string) {
  const tokens = await getGoogleTokens(userId);

  if (!tokens.scope?.includes('gmail.readonly')) {
    throw new Error('Gmail scope not granted. Please re-authenticate.');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}
```

**Update Gmail sync to use OAuth:**

```typescript
// In /Users/masa/Projects/izzie2/src/app/api/gmail/sync/route.ts
import { requireAuth } from '@/lib/auth';
import { getGmailServiceWithOAuth } from '@/lib/google/gmail-oauth';

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  const gmail = await getGmailServiceWithOAuth(session.user.id);
  // ... rest of sync logic
}
```

---

## Testing Checklist

After implementing OAuth Gmail access:

- [ ] Add Gmail scope to OAuth configuration
- [ ] Deploy updated OAuth configuration
- [ ] Test new user signup flow
- [ ] Verify `accounts.scope` includes `gmail.readonly`
- [ ] Test existing user re-authentication flow
- [ ] Verify access token refresh works correctly
- [ ] Test Gmail API calls with OAuth tokens
- [ ] Update documentation with new OAuth flow
- [ ] Add error handling for missing Gmail scope
- [ ] Add user prompt to re-authorize if scope missing

---

## SQL Query to Check Current State

Run this query against your database to check existing OAuth tokens:

```sql
SELECT
  id,
  user_id,
  account_id,
  provider_id,
  access_token IS NOT NULL as has_access_token,
  refresh_token IS NOT NULL as has_refresh_token,
  scope,
  access_token_expires_at,
  created_at
FROM accounts
WHERE provider_id = 'google'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Results:**
- `has_access_token`: `true`
- `has_refresh_token`: `true`
- `scope`: Will likely show Calendar scopes but NOT Gmail
- `access_token_expires_at`: Should be a future timestamp

---

## Conclusion

**Current State:**
- OAuth tokens are stored correctly in the database
- OAuth configuration requests Calendar API access only
- Gmail API currently uses service account authentication
- **OAuth tokens CANNOT be used for Gmail API** (missing scope)

**Required Action:**
To use OAuth login tokens for Gmail API access, you must:
1. Add `https://www.googleapis.com/auth/gmail.readonly` to OAuth scopes
2. Existing users must re-authenticate to grant Gmail permissions
3. Update Gmail service to use OAuth tokens instead of service accounts

**Estimated Effort:**
- Configuration change: 5 minutes
- Code implementation: 1-2 hours
- Testing: 1 hour
- User migration: Requires re-authentication flow

---

## References

- Better Auth OAuth Configuration: `/Users/masa/Projects/izzie2/src/lib/auth/index.ts`
- Database Schema: `/Users/masa/Projects/izzie2/src/lib/db/schema.ts`
- Service Account Auth: `/Users/masa/Projects/izzie2/src/lib/google/auth.ts`
- Gmail Sync Endpoint: `/Users/masa/Projects/izzie2/src/app/api/gmail/sync/route.ts`
- Google OAuth Scopes: https://developers.google.com/identity/protocols/oauth2/scopes#gmail

---

**Next Steps:**
1. Decide on authentication strategy (OAuth vs Service Account vs Hybrid)
2. If choosing OAuth: Update configuration and implement OAuth-based Gmail service
3. Plan user re-authentication flow for existing users
4. Test thoroughly before deploying to production
