# Multi-Account Google Connection Analysis

**Date**: 2026-01-22
**Research Type**: Architecture Analysis
**Classification**: Actionable

---

## Executive Summary

The Izzie2 project's current authentication architecture **partially supports** multi-account Google connections at the database level, but the application code assumes a single Google account per user throughout. This analysis identifies the gaps and provides a recommended implementation approach for full multi-account support.

---

## 1. Current Account Structure Summary

### 1.1 Database Schema

**File**: `/src/lib/db/schema.ts`

The `accounts` table schema **already supports** multiple OAuth accounts per user:

```typescript
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  accountId: text('account_id').notNull(),    // Provider's unique user ID (e.g., Google account ID)
  providerId: text('provider_id').notNull(),  // e.g., 'google'
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  scope: text('scope'),
  // ... additional fields
});
```

**Key Observation**: There is NO unique constraint on `(userId, providerId)`, meaning a user CAN have multiple Google accounts linked.

### 1.2 Better Auth Configuration

**File**: `/src/lib/auth/index.ts`

Google OAuth is configured with comprehensive scopes:
- `openid`, `email`, `profile`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/tasks`
- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/contacts.readonly`

**Token Retrieval Pattern** (Current Implementation):
```typescript
export async function getGoogleTokens(userId: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
    .limit(1);  // <-- CRITICAL: Only retrieves FIRST account

  if (!account) {
    throw new Error('No Google account linked to this user');
  }
  return { accessToken, refreshToken, ... };
}
```

### 1.3 Google Integration Services

**Calendar Service** (`/src/lib/calendar/index.ts`):
- Uses `getGoogleTokens(userId)` - single account assumption
- Creates OAuth2Client per request
- Auto-refreshes tokens and persists to database

**Gmail Service** (`/src/lib/google/gmail.ts`):
- `GmailService` class takes OAuth2Client in constructor
- No built-in account selection logic

**Email Retrieval** (`/src/lib/chat/email-retrieval.ts`):
- `getGmailClient(userId)` calls `getGoogleTokens(userId)` - single account
- Returns `GmailService` instance for that one account

### 1.4 Context Retrieval

**File**: `/src/lib/chat/context-retrieval.ts`

The `retrieveContext()` function aggregates:
- Entities (from Weaviate)
- Memories (from DB)
- Calendar events (from Google Calendar)
- Pending tasks (from DB memory entries)
- Recent emails (from Gmail)

**Current Flow**:
```typescript
const [/* ... */, calendarResult, pendingTasks, recentEmailsResult] =
  await Promise.all([
    // ...
    listEvents(userId, { timeMin, timeMax, maxResults: 20 }),
    retrievePendingTasks(userId, 10),
    getRecentEmails(userId, { maxResults: 10, hoursBack: 24 }),
  ]);
```

All Google data retrieval uses `userId` only - no account selection parameter.

---

## 2. Gap Analysis: What's Missing for Multi-Account Support

### 2.1 Critical Gaps

| Component | Current State | Gap |
|-----------|---------------|-----|
| `getGoogleTokens()` | Returns first account only (`.limit(1)`) | Needs `accountId` parameter or return all accounts |
| `getCalendarClient()` | Single account per user | Needs account selection |
| `getGmailClient()` | Single account per user | Needs account selection |
| `listEvents()` | No account parameter | Needs `accountId` parameter |
| `getRecentEmails()` | No account parameter | Needs `accountId` parameter |
| `retrieveContext()` | Fetches from one account | Needs aggregation strategy or selection |

### 2.2 Missing Features

1. **Account Selection API**
   - No API endpoint to list linked Google accounts
   - No API to set "default" or "primary" account
   - No API to add additional Google accounts

2. **UI Components**
   - No account picker/selector in settings
   - No visual indicator of which account is active
   - No "Add another Google account" flow

3. **Data Aggregation Strategy**
   - No logic to merge calendars from multiple accounts
   - No logic to merge email inboxes from multiple accounts
   - No conflict resolution (same event in multiple calendars)

4. **Account Metadata**
   - `accounts` table lacks `isPrimary` flag
   - No `displayName` or `email` stored for quick reference
   - No `lastUsedAt` for sorting/prioritization

### 2.3 OAuth Flow Limitation

The current Better Auth Google OAuth flow will **replace** the existing account when a user signs in with a different Google account, rather than **adding** it. This is because:

1. Better Auth uses `providerId` + `accountId` to identify accounts
2. If the user authenticates with a new Google account, it creates a new record
3. BUT the UI flow doesn't distinguish between "sign in" and "link account"

---

## 3. Recommended Implementation Approach

### 3.1 Phase 1: Database & Core Functions (Foundation)

**Step 1.1: Extend accounts table schema**

```typescript
// Add to /src/lib/db/schema.ts
export const accounts = pgTable('accounts', {
  // ... existing fields ...

  // New fields for multi-account support
  isPrimary: boolean('is_primary').default(false),
  accountEmail: text('account_email'),       // Cached email for display
  accountName: text('account_name'),         // Cached display name
  lastUsedAt: timestamp('last_used_at'),     // Track usage
});
```

**Step 1.2: Update `getGoogleTokens()` function**

```typescript
// Option A: Get specific account by accountId
export async function getGoogleTokens(userId: string, accountId?: string) {
  const query = db
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.providerId, 'google'),
      ...(accountId ? [eq(accounts.accountId, accountId)] : [])
    ));

  if (accountId) {
    const [account] = await query.limit(1);
    if (!account) throw new Error('Google account not found');
    return formatTokens(account);
  }

  // No accountId specified - return primary or first account
  const [account] = await query
    .orderBy(desc(accounts.isPrimary), desc(accounts.lastUsedAt))
    .limit(1);

  if (!account) throw new Error('No Google account linked to this user');
  return formatTokens(account);
}

// Option B: Get all linked accounts
export async function getAllGoogleAccounts(userId: string) {
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
    .orderBy(desc(accounts.isPrimary), desc(accounts.lastUsedAt));
}
```

### 3.2 Phase 2: Service Layer Updates

**Step 2.1: Update Calendar/Gmail client factories**

```typescript
// /src/lib/calendar/index.ts
async function getCalendarClient(userId: string, accountId?: string) {
  const tokens = await getGoogleTokens(userId, accountId);
  // ... existing OAuth2Client setup ...
}

// /src/lib/chat/email-retrieval.ts
async function getGmailClient(userId: string, accountId?: string) {
  const tokens = await getGoogleTokens(userId, accountId);
  // ... existing OAuth2Client setup ...
}
```

**Step 2.2: Update exported functions**

```typescript
// /src/lib/calendar/index.ts
export async function listEvents(
  userId: string,
  options?: ListEventsOptions & { accountId?: string }
) {
  const { auth, calendar } = await getCalendarClient(userId, options?.accountId);
  // ... existing logic ...
}

// /src/lib/chat/email-retrieval.ts
export async function getRecentEmails(
  userId: string,
  options: GetRecentEmailsOptions & { accountId?: string } = {}
) {
  const gmailService = await getGmailClient(userId, options.accountId);
  // ... existing logic ...
}
```

### 3.3 Phase 3: Context Retrieval Strategy

**Option A: Aggregate All Accounts** (Recommended for comprehensive context)

```typescript
// /src/lib/chat/context-retrieval.ts
export async function retrieveContext(
  userId: string,
  message: string,
  recentMessages?: ChatMessage[],
  options?: ContextRetrievalOptions
): Promise<ChatContext> {
  // Get all linked Google accounts
  const googleAccounts = await getAllGoogleAccounts(userId);

  // Fetch from all accounts in parallel
  const calendarPromises = googleAccounts.map(account =>
    listEvents(userId, { ...calendarOptions, accountId: account.accountId })
      .catch(err => ({ events: [], error: err }))
  );

  const emailPromises = googleAccounts.map(account =>
    getRecentEmails(userId, { ...emailOptions, accountId: account.accountId })
      .catch(err => [])
  );

  const [calendarResults, emailResults] = await Promise.all([
    Promise.all(calendarPromises),
    Promise.all(emailPromises),
  ]);

  // Merge and deduplicate events
  const allEvents = calendarResults
    .flatMap(r => r.events || [])
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  // Merge emails (dedupe by message ID)
  const emailMap = new Map();
  emailResults.flat().forEach(email => emailMap.set(email.id, email));
  const allEmails = Array.from(emailMap.values())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    // ... other context ...
    upcomingEvents: allEvents,
    recentEmails: allEmails,
  };
}
```

**Option B: User-Selected Account** (For explicit control)

```typescript
// Add account selection to chat options
interface ContextRetrievalOptions {
  // ... existing options ...
  googleAccountId?: string;  // If not specified, use primary
  aggregateAllAccounts?: boolean;  // Default: false
}
```

### 3.4 Phase 4: Account Linking API

**Step 4.1: Create API endpoints**

```typescript
// /src/app/api/accounts/google/route.ts
export async function GET(request: Request) {
  const session = await requireAuth(request);
  const accounts = await getAllGoogleAccounts(session.user.id);
  return Response.json({ accounts });
}

export async function POST(request: Request) {
  // Initiate OAuth flow for additional account linking
  // Use state parameter to indicate "link" vs "sign-in"
}

export async function PATCH(request: Request) {
  // Set primary account
  const { accountId } = await request.json();
  await setPrimaryGoogleAccount(session.user.id, accountId);
}

export async function DELETE(request: Request) {
  // Unlink a Google account
  const { accountId } = await request.json();
  await unlinkGoogleAccount(session.user.id, accountId);
}
```

### 3.5 Phase 5: UI Components

1. **Settings Page Account Manager**
   - List all linked Google accounts
   - Show account email and avatar
   - Set primary account toggle
   - Remove account button
   - "Link Another Account" button

2. **Account Picker (Optional)**
   - Quick switcher in header/sidebar
   - Shows which account is active for current operations

---

## 4. Implementation Priority

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P0 | Update `getGoogleTokens()` with accountId parameter | Small | High |
| P0 | Add `getAllGoogleAccounts()` function | Small | High |
| P1 | Update calendar/email services to accept accountId | Medium | High |
| P1 | Add database migration for new account fields | Small | Medium |
| P2 | Update context retrieval with aggregation | Medium | High |
| P2 | Create account management API endpoints | Medium | Medium |
| P3 | Build account management UI | Large | Medium |
| P3 | Implement "Link Account" OAuth flow | Medium | Medium |

---

## 5. Migration Considerations

1. **Backward Compatibility**: All changes should be additive. The `accountId` parameter should be optional, defaulting to primary/first account.

2. **Existing Data**: Run a one-time migration to:
   - Set `isPrimary = true` for existing accounts
   - Populate `accountEmail` from the OAuth token or Google API

3. **Testing**: Create test fixtures with users having 1, 2, and 3+ Google accounts to verify aggregation logic.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| OAuth token refresh complexity with multiple accounts | Each account manages its own token refresh independently |
| Rate limiting across accounts | Implement per-account rate limiting; aggregate requests |
| UI complexity with many accounts | Limit to 5 Google accounts per user; show warning |
| Data confusion (which calendar is which) | Include account email in event/email metadata |

---

## Conclusion

The Izzie2 codebase has a **solid foundation** for multi-account support at the database level. The primary work involves:

1. **Refactoring** `getGoogleTokens()` to support account selection
2. **Propagating** the `accountId` parameter through service layers
3. **Deciding** on aggregation strategy for context retrieval
4. **Building** account management UI

Estimated total effort: **2-3 days** for core functionality, **+2 days** for full UI implementation.

---

*Research conducted by Claude Code Research Agent*
