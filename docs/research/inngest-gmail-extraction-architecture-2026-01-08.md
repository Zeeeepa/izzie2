# Inngest and Gmail Entity Extraction Architecture Analysis

**Date**: 2026-01-08
**Research Focus**: Inngest configuration, Gmail sync flow, database client issues, and OAuth token management
**Status**: Critical Issues Identified

---

## Executive Summary

The project uses a hybrid approach for Gmail entity extraction:
1. **Inngest-based approach** (original, currently broken)
2. **Direct extraction approach** (newer, working)

**Critical Issues Found**:
1. ❌ `dbClient.execute` is not a function - sync-state.ts uses wrong API
2. ❌ Service account impersonation failing - needs user OAuth tokens instead
3. ✅ Working solution exists: `/api/gmail/sync-user` with direct extraction

---

## 1. Inngest Configuration

### Inngest Client Setup
**Location**: `src/lib/events/index.ts`

```typescript
export const inngest = new Inngest({
  id: 'izzie2',
  name: 'Izzie2 AI Assistant',
  eventKey: process.env.INNGEST_EVENT_KEY,
});
```

**Environment Variable Required**: `INNGEST_EVENT_KEY`

### Registered Functions
**Location**: `src/lib/events/functions/index.ts`

Inngest functions registered:
- `classifyEvent` - Event classification
- `processEvent` - Event processing
- `sendNotification` - Notifications
- `scheduleEventFunction` - Event scheduling
- **`ingestEmails`** - Email ingestion (cron: hourly) ⚠️ BROKEN
- `ingestDrive` - Drive ingestion
- `ingestCalendar` - Calendar ingestion
- `extractTaskEntities` - Task entity extraction
- `extractEntitiesFromEmail` - Email entity extraction
- `extractEntitiesFromDrive` - Drive entity extraction
- `extractEntitiesFromCalendar` - Calendar entity extraction
- `updateGraph` - Graph updates

### API Endpoint
**Location**: `src/app/api/inngest/route.ts`

```typescript
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions, // All registered functions
});
```

**Endpoint**: `/api/inngest` - Inngest event handler endpoint

---

## 2. Gmail Sync Flow Analysis

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     TWO APPROACHES                              │
└─────────────────────────────────────────────────────────────────┘

APPROACH 1: Inngest-based (BROKEN)
┌──────────────────────┐
│  ingestEmails        │  Cron: Hourly
│  (Inngest Function)  │
└──────────┬───────────┘
           │
           ├─► getServiceAccountAuth('default') ❌ BROKEN
           │   └─► Invalid impersonation "sub" field: default
           │
           ├─► getSyncState() ❌ BROKEN
           │   └─► dbClient.execute is not a function
           │
           └─► Emit events: izzie/ingestion.email.extracted
               └─► extractEntitiesFromEmail (Inngest function)
                   └─► Entity extraction via AI

APPROACH 2: Direct User OAuth (WORKING)
┌──────────────────────┐
│  /api/gmail/sync-user│  Manual trigger
│  (Next.js API Route) │
└──────────┬───────────┘
           │
           ├─► requireAuth(request) ✅ Gets user session
           │
           ├─► getGoogleTokens(userId) ✅ Gets OAuth tokens from DB
           │   └─► Query accounts table for Google OAuth tokens
           │
           ├─► getUserGmailClient() ✅ Creates OAuth2 client
           │   └─► Auto-refresh tokens
           │
           ├─► Fetch emails directly from Gmail API ✅
           │
           ├─► Extract entities directly (no Inngest) ✅
           │   └─► getEntityExtractor().extractFromEmail()
           │
           └─► Save to graph via processExtraction() ✅
```

---

## 3. Database Client Issues

### Issue #1: `dbClient.execute is not a function`

**Error Location**: `src/lib/ingestion/sync-state.ts:44`

**Root Cause**: Using wrong API method

```typescript
// ❌ BROKEN CODE (sync-state.ts:44)
const result = await dbClient.execute(sql`
  SELECT ...
`);
```

**Problem**: `dbClient` is a `NeonClient` instance that does NOT have an `execute()` method.

**Available Methods in NeonClient**:
```typescript
class NeonClient {
  getDb(): ReturnType<typeof drizzle>  // ✅ Use this
  getPool(): Pool                      // ✅ Or this
  executeRaw<T>(query, params)         // ✅ Or this
  verifyConnection()
  setupDatabase()
  getStats()
  clearAll()
  close()
  isConfigured()
}
```

**FIX OPTIONS**:

**Option A: Use `executeRaw()` method**
```typescript
// ✅ CORRECT - Use executeRaw
const result = await dbClient.executeRaw(
  `
  SELECT
    data->>'source' as source,
    (data->>'lastSyncTime')::timestamp as last_sync_time,
    data->>'lastPageToken' as last_page_token,
    data->>'lastHistoryId' as last_history_id,
    (data->>'itemsProcessed')::int as items_processed,
    data->>'lastError' as last_error,
    updated_at
  FROM metadata_store
  WHERE user_id = $1
    AND key = $2
  LIMIT 1
  `,
  [userId, `sync_state:${source}`]
);
```

**Option B: Use Drizzle ORM** (RECOMMENDED)
```typescript
// ✅ BETTER - Use Drizzle ORM with proper schema
import { dbClient } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { extractionProgress } from '@/lib/db/schema';

const db = dbClient.getDb();
const result = await db
  .select()
  .from(extractionProgress)
  .where(
    and(
      eq(extractionProgress.userId, userId),
      eq(extractionProgress.source, source)
    )
  )
  .limit(1);
```

**Option C: Use pool.query()** (if raw SQL needed)
```typescript
// ✅ ALTERNATIVE - Use pool directly
const pool = dbClient.getPool();
const result = await pool.query(
  `SELECT ... FROM metadata_store WHERE user_id = $1 AND key = $2`,
  [userId, `sync_state:${source}`]
);
```

### Issue #2: Missing `metadata_store` Table

**Problem**: `sync-state.ts` references `metadata_store` table that doesn't exist in schema.

**Current Schema Tables** (`src/lib/db/schema.ts`):
- ✅ `users` - User accounts
- ✅ `sessions` - Auth sessions
- ✅ `accounts` - OAuth provider accounts
- ✅ `verifications` - Email verifications
- ✅ `memory_entries` - Vector embeddings
- ✅ `conversations` - Chat conversations
- ✅ `extractionProgress` - Extraction tracking
- ❌ `metadata_store` - MISSING

**Better Approach**: Use existing `extractionProgress` table instead of `metadata_store`.

**Migration Path**:
1. Remove `sync-state.ts` dependency
2. Use `extraction/progress.ts` functions instead:
   - `getOrCreateProgress(userId, source)` - Get sync state
   - `updateProgress(userId, source, updates)` - Update state
   - `startExtraction()` - Start sync
   - `completeExtraction()` - Complete sync
   - `updateCounters()` - Update progress counters

---

## 4. Gmail User Impersonation Issue

### Issue: Invalid Service Account Impersonation

**Error**: `Invalid impersonation "sub" field: default`

**Location**: `src/lib/events/functions/ingest-emails.ts:26-44`

```typescript
// ❌ BROKEN CODE
const userId = process.env.DEFAULT_USER_ID || 'default';
const auth = await getServiceAccountAuth(userId); // Passes 'default' as email
```

**Root Cause**: Service account trying to impersonate user with email `'default'`

**Service Account Auth Code** (`src/lib/google/auth.ts:20-51`):
```typescript
export async function getServiceAccountAuth(
  userEmail?: string
): Promise<Auth.GoogleAuth> {
  // ...
  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedPath,
    scopes: SCOPES,
    // ❌ PROBLEM: userEmail = 'default' is not a valid email
    ...(userEmail && { clientOptions: { subject: userEmail } }),
  });
  return auth;
}
```

**Why This Fails**:
- Service accounts require **domain-wide delegation** to impersonate users
- The `subject` field must be a **real user email address** (e.g., `user@example.com`)
- `'default'` is not a valid email address
- Gmail API rejects the impersonation request

### Solutions

**SOLUTION 1: Use Real User OAuth Tokens** ✅ RECOMMENDED (Already Working)

Use the `/api/gmail/sync-user` endpoint which:
1. Authenticates user via better-auth session
2. Gets user's OAuth tokens from `accounts` table
3. Creates OAuth2 client with user's tokens
4. Accesses Gmail API as the actual user (no impersonation)

**SOLUTION 2: Fix Service Account Impersonation** (Requires Google Workspace)

Requirements:
- Google Workspace account (not personal Gmail)
- Domain-wide delegation enabled for service account
- Admin-level setup in Google Workspace Admin Console

```typescript
// ✅ FIXED - Use real user email
const userId = process.env.DEFAULT_USER_ID || 'user@yourdomain.com';
const auth = await getServiceAccountAuth(userId);
```

**SOLUTION 3: Remove Inngest Dependency for Gmail** ✅ RECOMMENDED

The `/api/gmail/sync-user` approach already works better:
- Direct entity extraction (no Inngest event overhead)
- Real-time progress tracking
- Uses user's OAuth tokens (no service account needed)
- Pause/resume support
- Better error handling

---

## 5. User OAuth Token Management

### Token Storage Architecture

**Schema** (`src/lib/db/schema.ts:179-203`):
```typescript
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  accountId: text('account_id').notNull(),      // Provider's user ID
  providerId: text('provider_id').notNull(),    // 'google'
  accessToken: text('access_token'),            // ✅ OAuth access token
  refreshToken: text('refresh_token'),          // ✅ OAuth refresh token
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),                         // ✅ Granted scopes
  password: text('password'),                   // For email/password auth
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### Token Retrieval

**Function**: `getGoogleTokens(userId)` - `src/lib/auth/index.ts:117-137`

```typescript
export async function getGoogleTokens(userId: string) {
  const db = dbClient.getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.providerId, 'google')  // ✅ Filter for Google OAuth
    ))
    .limit(1);

  if (!account) {
    throw new Error('No Google account linked to this user');
  }

  return {
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    accessTokenExpiresAt: account.accessTokenExpiresAt,
    refreshTokenExpiresAt: account.refreshTokenExpiresAt,
    scope: account.scope,
  };
}
```

### Gmail Client Initialization

**Working Example** (`src/app/api/gmail/sync-user/route.ts:36-75`):

```typescript
async function getUserGmailClient(userId: string) {
  // 1. Get tokens from database
  const tokens = await getGoogleTokens(userId);

  // 2. Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
  );

  // 3. Set credentials
  oauth2Client.setCredentials({
    access_token: tokens.accessToken || undefined,
    refresh_token: tokens.refreshToken || undefined,
    expiry_date: tokens.accessTokenExpiresAt
      ? new Date(tokens.accessTokenExpiresAt).getTime()
      : undefined,
  });

  // 4. Auto-refresh tokens
  oauth2Client.on('tokens', async (newTokens) => {
    console.log('[Gmail Sync User] Tokens refreshed for user:', userId);
    // TODO: Update tokens in database
  });

  // 5. Initialize Gmail API
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  return gmail;
}
```

### Token Scopes

**Required OAuth Scopes** (`src/lib/auth/index.ts:42-51`):
```typescript
scope: [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',        // ✅ Gmail
  'https://www.googleapis.com/auth/tasks.readonly',        // ✅ Tasks
  'https://www.googleapis.com/auth/drive.readonly',        // ✅ Drive
]
```

---

## 6. Extraction Pipeline Architecture

### Current Working Pipeline (Direct Extraction)

```
┌─────────────────────────────────────────────────────────────┐
│  USER TRIGGERS SYNC                                         │
│  POST /api/gmail/sync-user                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────────────┐
│  AUTHENTICATION & AUTHORIZATION                             │
├─────────────────────────────────────────────────────────────┤
│  1. requireAuth(request) → Get session                      │
│  2. getGoogleTokens(userId) → Get OAuth tokens              │
│  3. getUserGmailClient() → Create Gmail API client          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────────────┐
│  PROGRESS TRACKING INITIALIZATION                           │
├─────────────────────────────────────────────────────────────┤
│  1. getOrCreateProgress(userId, 'email')                    │
│  2. startExtraction(userId, 'email', startDate, endDate)    │
│     → Sets status = 'running'                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────────────┐
│  EMAIL FETCHING LOOP (with pagination)                      │
├─────────────────────────────────────────────────────────────┤
│  For each page:                                             │
│    1. Check if paused (getOrCreateProgress)                 │
│    2. gmail.users.messages.list({ maxResults, pageToken })  │
│    3. For each message:                                     │
│       a. gmail.users.messages.get({ id, format: 'full' })   │
│       b. Parse headers (Subject, From, To, Date)            │
│       c. Extract body (base64 decode)                       │
│       d. Build Email object                                 │
│       e. Extract entities (AI)                              │
│       f. Save to graph (processExtraction)                  │
│       g. Update progress counters                           │
│    4. Rate limiting delay (100ms)                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────────────┐
│  ENTITY EXTRACTION (per email)                              │
├─────────────────────────────────────────────────────────────┤
│  1. getEntityExtractor().extractFromEmail(email)            │
│     → Returns: { entities: [...], relationships: [...] }    │
│  2. processExtraction(extractionResult, metadata)           │
│     → Saves entities and relationships to graph database    │
│  3. updateCounters(userId, 'email', {                       │
│       processedItems: count,                                │
│       entitiesExtracted: entityCount                        │
│     })                                                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────────────┐
│  COMPLETION                                                 │
├─────────────────────────────────────────────────────────────┤
│  1. completeExtraction(userId, 'email', {                   │
│       oldestDate, newestDate                                │
│     })                                                      │
│     → Sets status = 'completed'                             │
│  2. Final updateCounters() with totals                      │
└─────────────────────────────────────────────────────────────┘
```

### Broken Pipeline (Inngest-based)

```
┌─────────────────────────────────────────────────────────────┐
│  INNGEST CRON TRIGGER (hourly)                              │
│  ingestEmails function                                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────────────┐
│  ❌ BROKEN: Service Account Auth                            │
├─────────────────────────────────────────────────────────────┤
│  const userId = 'default';                                  │
│  const auth = getServiceAccountAuth(userId);                │
│  → Error: Invalid impersonation "sub" field: default        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────────────┐
│  ❌ BROKEN: Sync State Management                           │
├─────────────────────────────────────────────────────────────┤
│  getSyncState(userId, 'gmail')                              │
│  → dbClient.execute() is not a function                     │
│  → metadata_store table doesn't exist                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────────────┐
│  ❌ NEVER REACHED: Event Emission                           │
├─────────────────────────────────────────────────────────────┤
│  inngest.send({                                             │
│    name: 'izzie/ingestion.email.extracted',                 │
│    data: emailData                                          │
│  })                                                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────────────┐
│  ❌ NEVER REACHED: Entity Extraction                        │
├─────────────────────────────────────────────────────────────┤
│  extractEntitiesFromEmail (Inngest function)                │
│  Listens for: izzie/ingestion.email.extracted              │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Headless Extraction Requirements

### What "Headless" Means

**Headless extraction** = Background extraction without requiring dashboard UI interaction

### Current Status

✅ **ALREADY HEADLESS** via `/api/gmail/sync-user`

The current working extraction endpoint can be triggered programmatically:

```bash
# Headless extraction via API call
curl -X POST http://localhost:3300/api/gmail/sync-user \
  -H "Content-Type: application/json" \
  -H "Cookie: izzie2.session_token=YOUR_SESSION_TOKEN" \
  -d '{
    "folder": "sent",
    "maxResults": 100,
    "since": "2024-01-01T00:00:00Z"
  }'
```

### Requirements for True Headless Extraction

**Option 1: Cron Job** (Server-side)
```typescript
// Create scheduled task in your infrastructure
// Example: Vercel Cron, GitHub Actions, or server cron

// pseudocode
every(1.hour).run(() => {
  for (const user of activeUsers) {
    fetch('/api/gmail/sync-user', {
      method: 'POST',
      headers: {
        'Cookie': generateServerSideCookie(user.sessionToken)
      },
      body: JSON.stringify({
        folder: 'sent',
        maxResults: 100
      })
    });
  }
});
```

**Option 2: Background Worker** (Separate Process)
```typescript
// worker.ts
import { getDb } from '@/lib/db';
import { users, accounts } from '@/lib/db/schema';

async function runHeadlessExtraction() {
  const db = getDb();

  // Get all users with Google OAuth
  const usersWithGoogle = await db
    .select()
    .from(users)
    .innerJoin(accounts, eq(accounts.userId, users.id))
    .where(eq(accounts.providerId, 'google'));

  for (const user of usersWithGoogle) {
    console.log(`Starting extraction for user: ${user.email}`);

    // Call internal extraction function directly
    await startUserSync(
      user.id,
      user.email,
      'sent',
      100,
      undefined // No since date = last 30 days
    );
  }
}

// Run every hour
setInterval(runHeadlessExtraction, 60 * 60 * 1000);
```

**Option 3: Inngest (Fixed Version)**
```typescript
// Create new Inngest function with proper user OAuth
export const ingestEmailsHeadless = inngest.createFunction(
  {
    id: 'ingest-emails-headless',
    name: 'Ingest Emails Headless',
    retries: 3,
  },
  { cron: '0 * * * *' }, // Run every hour
  async ({ step }) => {
    // Get all users with Google OAuth
    const db = dbClient.getDb();
    const usersWithGoogle = await step.run('get-users', async () => {
      return db
        .select()
        .from(users)
        .innerJoin(accounts, eq(accounts.userId, users.id))
        .where(eq(accounts.providerId, 'google'));
    });

    // Process each user
    for (const user of usersWithGoogle) {
      await step.run(`sync-user-${user.id}`, async () => {
        // Get user's Gmail client
        const gmail = await getUserGmailClient(user.id);

        // Fetch and extract (same logic as /api/gmail/sync-user)
        // ... extraction logic ...
      });
    }
  }
);
```

### Recommended Approach for Headless Extraction

**BEST: Background Worker with Direct Extraction**

Advantages:
- ✅ No Inngest complexity
- ✅ Direct database access
- ✅ Real-time progress tracking
- ✅ Pause/resume support
- ✅ Error handling built-in
- ✅ Already working code to reuse

Implementation:
1. Extract the `startUserSync()` function from `/api/gmail/sync-user/route.ts`
2. Create a new module: `src/lib/extraction/headless-worker.ts`
3. Run as separate Node.js process or scheduled task
4. Use environment variable to enable/disable: `ENABLE_HEADLESS_EXTRACTION=true`

---

## 8. Fixes Required

### Fix #1: Database Client API

**File**: `src/lib/ingestion/sync-state.ts`

**Change**:
```typescript
// ❌ BEFORE
const result = await dbClient.execute(sql`SELECT ...`);

// ✅ AFTER
const result = await dbClient.executeRaw(
  `SELECT ...`,
  [userId, `sync_state:${source}`]
);
```

**Better Approach**: Replace entire `sync-state.ts` with `extraction/progress.ts`

### Fix #2: Gmail Authentication

**File**: `src/lib/events/functions/ingest-emails.ts`

**Change**:
```typescript
// ❌ BEFORE
const userId = process.env.DEFAULT_USER_ID || 'default';
const auth = await getServiceAccountAuth(userId);

// ✅ AFTER - Option A: Use real email
const userId = process.env.DEFAULT_USER_EMAIL || 'user@yourdomain.com';
const auth = await getServiceAccountAuth(userId);

// ✅ AFTER - Option B: Use user OAuth (RECOMMENDED)
// Get user from database
const user = await getUserById(userId);
const tokens = await getGoogleTokens(userId);
const auth = createOAuth2Client(tokens);
```

### Fix #3: Remove Inngest Dependency (RECOMMENDED)

**Approach**: Deprecate `ingestEmails` Inngest function, use direct extraction

**Steps**:
1. Comment out `ingestEmails` from `src/lib/events/functions/index.ts`
2. Create scheduled task to call `/api/gmail/sync-user`
3. Or create background worker using `startUserSync()` logic

---

## 9. Environment Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Better Auth
BETTER_AUTH_SECRET=your-secret-key
NEXT_PUBLIC_APP_URL=http://localhost:3300

# Google OAuth (User Authentication)
GOOGLE_CLIENT_ID=409456389838-...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# Google Service Account (Optional - currently broken)
GOOGLE_SERVICE_ACCOUNT_EMAIL=izzie-assistant@izzie-456719.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=.credentials/google-service-account.json
GOOGLE_SERVICE_ACCOUNT_ID=102513362928084266785

# Inngest (Optional)
INNGEST_EVENT_KEY=your-inngest-key
```

### Current Issues with Environment

**Service Account**:
- ❌ `DEFAULT_USER_ID=default` → Should be real email
- ❌ Service account approach doesn't work for personal Gmail

**OAuth**:
- ✅ `GOOGLE_CLIENT_ID` configured
- ✅ `GOOGLE_CLIENT_SECRET` configured
- ✅ Scopes include Gmail readonly

---

## 10. Recommendations

### Immediate Actions

1. **✅ Use `/api/gmail/sync-user` for all Gmail extraction**
   - Already working
   - Uses user OAuth tokens
   - Direct entity extraction
   - Real-time progress tracking

2. **❌ Deprecate `ingestEmails` Inngest function**
   - Has 2 critical bugs (dbClient.execute, service account)
   - Adds unnecessary complexity
   - OAuth approach is better

3. **🔧 Fix or remove `sync-state.ts`**
   - Option A: Fix `dbClient.execute` → `dbClient.executeRaw`
   - Option B: Use `extraction/progress.ts` instead (RECOMMENDED)
   - Option C: Delete `sync-state.ts` entirely

### Long-term Architecture

**Recommended Stack**:
```
┌─────────────────────────────────────────────────────────────┐
│  EXTRACTION LAYER                                           │
├─────────────────────────────────────────────────────────────┤
│  • /api/gmail/sync-user (manual trigger)                    │
│  • Background worker (scheduled extraction)                 │
│  • Progress tracking via extraction/progress.ts             │
└─────────────────────────────────────────────────────────────┘
                              │
                              v
┌─────────────────────────────────────────────────────────────┐
│  AUTHENTICATION LAYER                                       │
├─────────────────────────────────────────────────────────────┤
│  • better-auth for user sessions                            │
│  • User OAuth tokens in accounts table                      │
│  • Auto-refresh tokens                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              v
┌─────────────────────────────────────────────────────────────┐
│  ENTITY EXTRACTION LAYER                                    │
├─────────────────────────────────────────────────────────────┤
│  • getEntityExtractor().extractFromEmail()                  │
│  • AI-powered entity recognition                            │
│  • Returns: { entities, relationships }                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              v
┌─────────────────────────────────────────────────────────────┐
│  GRAPH STORAGE LAYER                                        │
├─────────────────────────────────────────────────────────────┤
│  • processExtraction(result, metadata)                      │
│  • Stores entities in graph database                        │
│  • Creates relationships between entities                   │
└─────────────────────────────────────────────────────────────┘
```

**Remove from Stack**:
- ❌ Inngest for email ingestion (keep for other events)
- ❌ Service account authentication for Gmail
- ❌ sync-state.ts module
- ❌ metadata_store table concept

**Keep in Stack**:
- ✅ better-auth for user authentication
- ✅ User OAuth tokens for Gmail access
- ✅ Direct extraction pipeline
- ✅ extraction/progress.ts for tracking
- ✅ Real-time progress updates

---

## 11. Summary of Findings

### Critical Issues

1. **`dbClient.execute is not a function`**
   - Location: `sync-state.ts:44`
   - Fix: Use `dbClient.executeRaw()` or `dbClient.getDb()` with Drizzle
   - Better: Use `extraction/progress.ts` instead

2. **Invalid impersonation "sub" field: default**
   - Location: `ingest-emails.ts:26-44`
   - Cause: Service account trying to impersonate user 'default'
   - Fix: Use user OAuth tokens instead (already working in `/api/gmail/sync-user`)

3. **Missing `metadata_store` table**
   - Location: Referenced in `sync-state.ts`
   - Fix: Use `extractionProgress` table instead

### Working Solutions

1. ✅ **User OAuth Authentication**
   - `getGoogleTokens(userId)` → Gets tokens from DB
   - `getUserGmailClient()` → Creates OAuth2 client
   - Auto-refresh tokens supported

2. ✅ **Direct Entity Extraction**
   - `/api/gmail/sync-user` endpoint
   - Extracts entities without Inngest overhead
   - Real-time progress tracking
   - Pause/resume support

3. ✅ **Progress Tracking**
   - `extraction/progress.ts` module
   - Database-backed progress state
   - Supports multiple sources (email, calendar, drive)

### Architecture Status

**Working**:
- ✅ User authentication (better-auth)
- ✅ OAuth token storage and retrieval
- ✅ Gmail API access with user tokens
- ✅ Entity extraction from emails
- ✅ Graph storage of entities
- ✅ Progress tracking

**Broken**:
- ❌ Inngest-based email ingestion
- ❌ Service account authentication
- ❌ sync-state.ts module
- ❌ Scheduled hourly extraction

**Recommended**:
- Use direct extraction approach (already working)
- Create background worker for scheduled extraction
- Remove Inngest dependency for Gmail (keep for other events)
- Consolidate on extraction/progress.ts for state management

---

## Next Steps

1. **Fix immediate issues**:
   ```bash
   # Option A: Quick fix
   - Update sync-state.ts to use dbClient.executeRaw()
   - Update ingest-emails.ts to use real user email

   # Option B: Proper fix (RECOMMENDED)
   - Delete sync-state.ts
   - Remove ingestEmails from Inngest functions
   - Create background worker using startUserSync() logic
   ```

2. **Create headless extraction worker**:
   ```bash
   # Create new file
   src/lib/extraction/headless-worker.ts

   # Extract logic from /api/gmail/sync-user
   # Schedule with cron or background task
   ```

3. **Test extraction pipeline**:
   ```bash
   # Manual trigger
   curl -X POST http://localhost:3300/api/gmail/sync-user \
     -H "Cookie: session_token=..." \
     -d '{"folder": "sent", "maxResults": 10}'

   # Check progress
   curl http://localhost:3300/api/extraction/status
   ```

4. **Monitor extraction**:
   ```bash
   # Check database
   SELECT * FROM extraction_progress WHERE user_id = 'USER_ID';

   # Check entities
   SELECT COUNT(*) FROM entities WHERE source = 'email';
   ```

---

**Research Complete**: 2026-01-08
