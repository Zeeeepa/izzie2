# GitHub Integration Research for Izzie2

**Date**: 2026-01-23
**Researcher**: Claude Code (Research Agent)
**Purpose**: Analyze codebase to determine how to add GitHub access for ticket management

---

## Executive Summary

Izzie2 currently has **Google OAuth only** with no GitHub integration. The codebase has clear patterns for adding new OAuth providers, services, and chat tools. A GitHub integration would require:

1. Adding GitHub as an OAuth provider in Better Auth
2. Creating a `GitHubService` class following the `GmailService` pattern
3. Creating GitHub chat tools following the email tools pattern
4. Installing `@octokit/rest` for GitHub API access

---

## 1. Current OAuth Providers and Scopes

### Provider: Google OAuth (only provider)
**File**: `/src/lib/auth/index.ts`

**Configured Scopes**:
- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/tasks`
- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/contacts.readonly`

**Key Configuration**:
```typescript
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    scope: [...],
    accessType: 'offline',  // Enables refresh tokens
    prompt: 'consent',      // Forces consent screen
  },
},
```

**GitHub OAuth**: NOT CONFIGURED

---

## 2. Existing GitHub Integration Status

### Current State: MINIMAL (Webhook Only)

**File Found**: `/src/app/api/webhooks/github/route.ts`

This is a **webhook receiver** that:
- Receives GitHub webhooks (push, issues, pull_request events)
- Validates webhook signatures using `GITHUB_WEBHOOK_SECRET`
- Forwards events to Inngest for async processing
- Does NOT make any GitHub API calls

```typescript
// Environment variables required:
// - GITHUB_WEBHOOK_SECRET (for signature validation)
```

### Missing Components:
- No GitHub OAuth provider configured
- No Octokit or @octokit/rest in dependencies
- No GitHubService class
- No GitHub chat tools
- No GitHub token storage or refresh logic

---

## 3. Token Storage Mechanism

### Database Schema: `/src/lib/db/schema.ts`

**Primary Table**: `accounts`
```typescript
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  providerId: text('provider_id').notNull(),  // 'google', could add 'github'
  accountId: text('account_id').notNull(),    // Provider's user ID
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

**Multi-Account Support**: `accountMetadata`
```typescript
export const accountMetadata = pgTable('account_metadata', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  accountId: text('account_id').references(() => accounts.id),
  userId: text('user_id').references(() => users.id),
  label: text('label'),           // e.g., 'work', 'personal'
  isPrimary: boolean('is_primary').default(false),
  accountEmail: text('account_email'),
});
```

**Key Insight**: The schema already supports multiple OAuth providers per user via `providerId` field.

### Token Helper Functions (in `/src/lib/auth/index.ts`):
- `getGoogleTokens(userId, accountId?)` - Get tokens for a user
- `updateGoogleTokens(userId, tokens)` - Update refreshed tokens
- `getAllGoogleAccounts(userId)` - List all connected accounts
- `setPrimaryAccount(userId, accountId)` - Set primary account

These could be generalized or duplicated for GitHub.

---

## 4. Chat Tool Pattern

### Registry: `/src/lib/chat/tools/index.ts`

Tools are registered in a central object and converted to OpenAI function calling format:

```typescript
export const chatTools = {
  research: researchTool,
  create_task: createTaskTool,
  archive_email: archiveEmailTool,
  // ... more tools
};

export function getChatToolDefinitions() {
  return Object.entries(chatTools).map(([name, tool]) => ({
    type: 'function' as const,
    function: {
      name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters, { target: 'openAi' }),
    },
  }));
}
```

### Tool Structure: `/src/lib/chat/tools/email.ts`

Each tool has:
1. **Zod Schema** for parameter validation
2. **Tool object** with name, description, parameters, execute function

```typescript
// Schema
export const archiveEmailToolSchema = z.object({
  searchQuery: z.string().describe('Gmail search query...'),
});

// Tool definition
export const archiveEmailTool = {
  name: 'archive_email',
  description: 'Archive an email by searching for it...',
  parameters: archiveEmailToolSchema,

  async execute(params: ArchiveEmailParams, userId: string): Promise<{ message: string }> {
    const validated = archiveEmailToolSchema.parse(params);
    const gmailService = await getGmailClient(userId);
    // ... implementation
    return { message: 'Success...' };
  },
};
```

---

## 5. Service Pattern

### GmailService: `/src/lib/google/gmail.ts`

**Pattern**: Class-based service wrapping API client

```typescript
export class GmailService {
  private gmail: gmail_v1.Gmail;
  private auth: Auth.GoogleAuth | Auth.OAuth2Client;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.auth = auth;
    this.gmail = google.gmail({ version: 'v1', auth: auth as Auth.OAuth2Client });
  }

  // Methods for each operation
  async fetchEmails(options: FetchEmailOptions): Promise<EmailBatch> { ... }
  async getEmail(id: string): Promise<Email> { ... }
  async archiveEmail(id: string): Promise<void> { ... }
  async sendEmail(to, subject, body, options?): Promise<string> { ... }
  // ... more methods
}
```

**Key Features**:
- Takes OAuth2Client in constructor
- Wraps googleapis SDK
- Returns typed responses
- Includes rate limiting (`RATE_LIMIT_DELAY_MS = 100`)
- Batch operations with success/failure counts

### Client Initialization Pattern (in chat tools):

```typescript
async function getGmailClient(userId: string): Promise<GmailService> {
  const tokens = await getGoogleTokens(userId);
  if (!tokens) throw new Error('No Google tokens found for user');

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.accessTokenExpiresAt?.getTime(),
  });

  // Auto-refresh tokens
  oauth2Client.on('tokens', async (newTokens) => {
    await updateGoogleTokens(userId, newTokens);
  });

  return new GmailService(oauth2Client);
}
```

---

## 6. Recommended Approach for GitHub Integration

### OAuth vs PAT Analysis

| Approach | Pros | Cons |
|----------|------|------|
| **OAuth App** | User consent, limited scopes, refresh tokens, multi-user | More complex setup, requires callback |
| **GitHub App** | Best for org access, fine-grained permissions, installation tokens | Complex, overkill for single-repo |
| **PAT (Classic)** | Simple, immediate, no callback | No refresh, tied to single user, expires |
| **PAT (Fine-Grained)** | Repository-scoped, fine permissions | Still single-user, manual rotation |

### Recommendation: **OAuth App** (aligns with existing pattern)

**Rationale**:
1. Consistent with existing Google OAuth flow
2. Better Auth supports GitHub OAuth natively
3. Proper token refresh support
4. User-granted permissions
5. Future multi-user support

### Required GitHub OAuth Scopes

For ticket/issue management in bobmatnyc/izzie2:

| Scope | Purpose |
|-------|---------|
| `repo` | Read/write access to issues, PRs, code |
| `read:user` | Read user profile info |
| `user:email` | Access email addresses |

**Minimal for issues only**: `public_repo` (if repo is public) or `repo` (for private)

### Implementation Components Needed

#### 1. Dependencies
```bash
pnpm add @octokit/rest
```

#### 2. OAuth Configuration (`/src/lib/auth/index.ts`)
```typescript
socialProviders: {
  google: { ... },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    scope: ['repo', 'read:user', 'user:email'],
  },
},
```

#### 3. Token Helpers (new or generalized)
```typescript
export async function getGitHubTokens(userId: string, accountId?: string) { ... }
export async function updateGitHubTokens(userId: string, tokens: {...}) { ... }
```

#### 4. GitHubService Class (`/src/lib/github/service.ts`)
```typescript
export class GitHubService {
  private octokit: Octokit;

  constructor(accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken });
  }

  async createIssue(owner, repo, title, body) { ... }
  async listIssues(owner, repo, options?) { ... }
  async updateIssue(owner, repo, issueNumber, updates) { ... }
  async closeIssue(owner, repo, issueNumber) { ... }
  async addComment(owner, repo, issueNumber, body) { ... }
  // ... more methods
}
```

#### 5. Chat Tools (`/src/lib/chat/tools/github.ts`)
```typescript
export const createIssueToolSchema = z.object({
  title: z.string().describe('Issue title'),
  body: z.string().optional().describe('Issue body/description'),
  labels: z.array(z.string()).optional().describe('Labels to apply'),
});

export const createIssueTool = {
  name: 'create_issue',
  description: 'Create a new GitHub issue in the project repository',
  parameters: createIssueToolSchema,
  async execute(params, userId) { ... }
};
```

#### 6. Environment Variables
```bash
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_WEBHOOK_SECRET=xxx  # Already exists
```

---

## 7. File Locations Summary

| Component | Location |
|-----------|----------|
| OAuth Config | `/src/lib/auth/index.ts` |
| Auth Client (React) | `/src/lib/auth/client.ts` |
| Database Schema | `/src/lib/db/schema.ts` |
| Chat Tools Registry | `/src/lib/chat/tools/index.ts` |
| Email Tools Example | `/src/lib/chat/tools/email.ts` |
| GmailService Example | `/src/lib/google/gmail.ts` |
| Google Services Index | `/src/lib/google/index.ts` |
| GitHub Webhook (existing) | `/src/app/api/webhooks/github/route.ts` |

---

## 8. Implementation Checklist

### Phase 1: OAuth Setup
- [ ] Add `@octokit/rest` dependency
- [ ] Add GitHub OAuth config to Better Auth
- [ ] Add GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET env vars
- [ ] Create sign-in with GitHub helper function
- [ ] Test OAuth flow end-to-end

### Phase 2: Service Layer
- [ ] Create `/src/lib/github/` directory
- [ ] Create `GitHubService` class
- [ ] Create `getGitHubTokens` helper
- [ ] Create `getGitHubClient` helper for chat tools
- [ ] Test token refresh flow

### Phase 3: Chat Tools
- [ ] Create `/src/lib/chat/tools/github.ts`
- [ ] Implement create_issue tool
- [ ] Implement list_issues tool
- [ ] Implement update_issue tool
- [ ] Implement add_comment tool
- [ ] Register tools in index.ts
- [ ] Test through chat interface

### Phase 4: Polish
- [ ] Add error handling and user-friendly messages
- [ ] Add confirmation flows for destructive actions
- [ ] Add rate limiting if needed
- [ ] Update documentation

---

## Appendix: Related Database Tables

The `proxyAuthorizations` table already has 'github' as a recognized action type:
```typescript
actionType: text('action_type').notNull(), // 'email', 'calendar', 'github', etc.
```

This suggests GitHub integration was anticipated in the original design.
