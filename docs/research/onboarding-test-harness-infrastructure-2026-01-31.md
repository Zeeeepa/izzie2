# Onboarding Test Harness Infrastructure Research

**Date**: 2026-01-31
**Research Type**: Infrastructure Analysis
**Status**: Completed

---

## Executive Summary

This research investigates the existing infrastructure to plan an onboarding test harness build. The codebase has excellent reusable patterns, particularly the `scripts/extract-gmail-entities.ts` standalone script which serves as an ideal template. All major components (Gmail API, OAuth, LLM integration, progress tracking) are already implemented and can be reused.

---

## 1. Gmail Sent Email Access

### Current Integration

**Core File**: `src/lib/google/gmail.ts` (864 lines)

The `GmailService` class provides comprehensive Gmail API access using the `googleapis` library.

```typescript
// Key method for fetching emails
async fetchEmails(options: FetchEmailOptions): Promise<EmailBatch> {
  const { folder, maxResults, pageToken, since, labelIds, excludePromotions, excludeSocial } = options;
  const query = this.buildQuery(folder, since, excludePromotions, excludeSocial);
  const labels = labelIds || this.getFolderLabels(folder);
  // Uses gmail.users.messages.list with q: query, labelIds: labels
}
```

### Fetching Sent Emails

**Label Support**: The `getFolderLabels()` method returns `['SENT']` for sent folder:

```typescript
private getFolderLabels(folder: string): string[] {
  switch (folder) {
    case 'inbox': return ['INBOX'];
    case 'sent': return ['SENT'];
    case 'all': return [];
    case 'important': return ['IMPORTANT'];
    case 'starred': return ['STARRED'];
    default: return [];
  }
}
```

**Usage**:
```typescript
const emails = await gmailService.fetchEmails({
  folder: 'sent',
  maxResults: 100,
  since: new Date('2024-01-01')
});
```

### Date Pagination

The `buildQuery()` method supports date filtering:

```typescript
private buildQuery(folder: string, since?: Date, excludePromotions?: boolean, excludeSocial?: boolean): string {
  const parts: string[] = [];

  if (since) {
    const dateStr = since.toISOString().split('T')[0].replace(/-/g, '/');
    parts.push(`after:${dateStr}`);
  }

  // Additional filters for promotions, social, etc.
  return parts.join(' ');
}
```

### Recommendation

Reuse `GmailService` directly. For the test harness:
- Use `folder: 'sent'` to fetch sent emails only
- Use `since: Date` for date-based pagination
- Use `maxResults` for batch size control
- Pagination handled via `pageToken` in response

---

## 2. Existing Classification/NLP Infrastructure

### OpenRouter AI Client

**Core File**: `src/lib/ai/client.ts` (344 lines)

Singleton client using OpenAI SDK with OpenRouter as backend:

```typescript
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

this.client = new OpenAI({
  baseURL: OPENROUTER_BASE_URL,
  apiKey: key,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'X-Title': 'Izzie2',
  },
});
```

**Key Features**:
- Singleton pattern via `getAIClient()`
- Cost tracking per request
- Streaming support
- Tier escalation (CHEAP → STANDARD → PREMIUM)

### Entity Extraction

**Core File**: `src/lib/extraction/entity-extractor.ts` (525 lines)

Uses Mistral Small via OpenRouter for structured entity extraction:

```typescript
async extractFromEmail(email: Email): Promise<ExtractionResult> {
  const response = await this.client.chat(
    [
      { role: 'system', content: 'You are an expert entity extraction system...' },
      { role: 'user', content: prompt }
    ],
    {
      model: MODELS.CLASSIFIER, // Mistral Small
      maxTokens: 1500,
      temperature: 0.1
    }
  );
  // Returns entities, relationships, spam classification
}
```

**Entity Types Extracted**:
- `person` - People mentioned in emails
- `company` - Organizations
- `project` - Projects referenced
- `date` - Date references
- `topic` - Key topics/subjects
- `location` - Geographic locations
- `action_item` - Tasks/action items

### Tiered Classification

**Core File**: `src/lib/events/functions/classify-event.ts` (157 lines)

Inngest-based classification with tier escalation:

```typescript
// Uses getClassifier() from @/agents/classifier
// Escalates from cheap → standard → premium models based on complexity
```

### Recommendation

For the test harness, reuse:
- `getAIClient()` singleton for LLM access
- `EntityExtractor` class for contact extraction
- `MODELS` constants from `@/lib/ai/models` for model selection

---

## 3. OAuth Infrastructure

### Better Auth Configuration

**Core File**: `src/lib/auth/index.ts` (737 lines)

Uses Better Auth with Google OAuth provider:

```typescript
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: schema,
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
        // ...additional scopes
      ],
    },
  },
});
```

### Token Retrieval

**Critical Function**: `getGoogleTokens(userId, accountId?)`

```typescript
export async function getGoogleTokens(userId: string, accountId?: string): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  accountId: string;
  providerId: string;
  scope: string | null;
} | null>
```

This function retrieves OAuth tokens stored in the `accounts` table.

### Creating Gmail Client from Tokens

**Pattern from**: `scripts/extract-gmail-entities.ts`

```typescript
function getUserGmailClient(tokens: {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date | null
}) {
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
      : 'http://localhost:3300/api/auth/callback/google'
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.accessTokenExpiresAt?.getTime(),
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}
```

### Running OAuth Locally

**Requirements**:
1. Environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
2. Google Cloud Console callback URL: `http://localhost:3300/api/auth/callback/google`
3. Database access for token storage/retrieval

**For Test Harness**: Can either:
- Use existing user tokens from database (recommended for testing)
- Implement standalone OAuth flow if needed

### Recommendation

Reuse `getGoogleTokens()` to retrieve existing user tokens. No need for separate OAuth - the test harness can operate on already-authenticated users.

---

## 4. Test Harness Patterns

### Existing Standalone Scripts

**Scripts Directory**: `scripts/` contains 90+ standalone scripts

**Best Template**: `scripts/extract-gmail-entities.ts` (734 lines)

This script demonstrates the exact pattern needed:

```typescript
// CLI argument parsing
const args = process.argv.slice(2);
let userId = '';
let limit = 50;
let sinceDate: Date | null = null;
let folder = 'inbox';
let incremental = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--user': userId = args[++i]; break;
    case '--limit': limit = parseInt(args[++i], 10); break;
    case '--since': sinceDate = new Date(args[++i]); break;
    case '--folder': folder = args[++i]; break;
    case '--incremental': incremental = true; break;
  }
}

// Main execution
async function main() {
  // 1. Get user tokens from database
  const tokens = await getGoogleTokens(userId);

  // 2. Create Gmail client
  const gmailClient = getUserGmailClient(tokens);

  // 3. Fetch and process emails
  const emails = await fetchEmails(gmailClient, { folder, since: sinceDate, limit });

  // 4. Extract entities
  for (const email of emails) {
    const result = await extractor.extractFromEmail(email);
    // Process results...
  }

  // 5. Update progress
  await updateProgress(userId, processedCount, lastDate);
}
```

### Port Usage

| Port | Usage |
|------|-------|
| 3300 | Main Next.js app (`next dev -p 3300`) |
| 3001 | MCP server (`src/mcp-server/index.ts`) |
| 8288 | Inngest dev server |

**Recommendation**: Use port **4000** for test harness (available, clear of conflicts)

### Vite for Local Dev

The project already uses Vite via Vitest for testing:

```json
{
  "devDependencies": {
    "@vitest/ui": "^4.0.16",
    "vitest": "^4.0.16"
  }
}
```

**For Test Harness UI**: Can create a Vite-based UI if needed, or use the standalone script pattern which is simpler and already proven.

### Recommendation

Model the test harness after `scripts/extract-gmail-entities.ts`:
- Standalone TypeScript script runnable via `tsx`
- CLI arguments for configuration
- Direct database access via Drizzle
- No web server needed for core functionality
- Optional: Add simple Express/Vite UI on port 4000 if interactive UI needed

---

## 5. State Management

### Existing Progress Tracking

**Core File**: `src/lib/extraction/progress.ts` (314 lines)

**Database Table**: `extractionProgress`

```typescript
export type ExtractionSource = 'email' | 'calendar' | 'drive' | 'contacts';
export type ExtractionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

// Table schema includes:
// - userId, source, status
// - processedItems, totalItems
// - lastProcessedDate, oldestProcessedDate
// - currentPageToken
// - lastError, startedAt, completedAt
// - costAccumulated
```

**Available Functions**:

```typescript
// Get or create progress record
export async function getOrCreateProgress(
  userId: string,
  source: ExtractionSource
): Promise<ExtractionProgress>

// Start extraction
export async function startExtraction(
  userId: string,
  source: ExtractionSource,
  totalItems?: number
): Promise<ExtractionProgress>

// Update counters
export async function updateCounters(
  userId: string,
  source: ExtractionSource,
  processed: number,
  lastDate?: Date
): Promise<void>

// Complete extraction
export async function completeExtraction(
  userId: string,
  source: ExtractionSource
): Promise<void>
```

### Recommendation

Reuse existing `extractionProgress` table and functions:
- Add new source type `'onboarding'` or `'sent_analysis'` if needed
- Track: processed days, last processed date, status
- No need for SQLite or file-based storage - PostgreSQL already in place

---

## Architecture Recommendation

### Proposed Test Harness Structure

```
scripts/
  onboarding-test-harness/
    index.ts              # Main entry point
    config.ts             # CLI args and configuration
    gmail-fetcher.ts      # Sent email fetching logic
    contact-extractor.ts  # NLP extraction for contacts
    progress-tracker.ts   # Progress state management
    ui/ (optional)
      server.ts           # Express/Vite UI server (port 4000)
      index.html          # Simple UI for manual testing
```

### Data Flow

```
1. User Selection
   └─> Get user from CLI arg (--user) or UI selection

2. OAuth Token Retrieval
   └─> getGoogleTokens(userId) from Better Auth

3. Gmail Client Creation
   └─> OAuth2Client with retrieved tokens

4. Sent Email Fetching
   └─> GmailService.fetchEmails({ folder: 'sent', since: Date })

5. Entity Extraction
   └─> EntityExtractor.extractFromEmail(email)
   └─> Filter for person/company entities (contacts)

6. Progress Tracking
   └─> Update extractionProgress table

7. Results Storage
   └─> Store extracted contacts in database
```

### Reusable Components

| Component | Source File | Usage |
|-----------|-------------|-------|
| Gmail API | `src/lib/google/gmail.ts` | Fetch sent emails |
| OAuth Tokens | `src/lib/auth/index.ts` | `getGoogleTokens()` |
| AI Client | `src/lib/ai/client.ts` | `getAIClient()` |
| Entity Extraction | `src/lib/extraction/entity-extractor.ts` | Extract contacts |
| Progress Tracking | `src/lib/extraction/progress.ts` | State management |
| Database | `drizzle/schema.ts` | Drizzle ORM access |

---

## Blockers and Considerations

### No Blockers Identified

All required infrastructure exists and is well-documented.

### Considerations

1. **Rate Limiting**: Gmail API has rate limits. The existing `GmailService` doesn't implement rate limiting - may need to add delays for large extractions.

2. **Token Refresh**: OAuth tokens expire. The `OAuth2Client` handles refresh automatically if refresh token is present.

3. **Entity Extraction Cost**: Uses Mistral Small via OpenRouter at ~$0.001 per email. For large sent mail histories, costs can accumulate.

4. **Sent Mail Volume**: Users may have 10,000+ sent emails. Implement:
   - Date-based windowing (process by month)
   - Batch size limits
   - Progress checkpointing

5. **Contact Deduplication**: The entity extractor may return the same person/company multiple times. Implement deduplication by normalized name.

6. **Privacy**: Sent emails contain sensitive content. Ensure:
   - No email content is logged in production
   - Extracted contacts are user-scoped
   - Progress data doesn't leak PII

---

## Quick Start Implementation

```typescript
// scripts/onboarding-harness.ts
import { getGoogleTokens } from '@/lib/auth';
import { GmailService } from '@/lib/google/gmail';
import { getEntityExtractor } from '@/lib/extraction/entity-extractor';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

async function main() {
  const userId = process.argv[2] || process.env.TEST_USER_ID;

  // 1. Get OAuth tokens
  const tokens = await getGoogleTokens(userId);
  if (!tokens) throw new Error('No tokens found for user');

  // 2. Create Gmail client
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  const gmailApi = google.gmail({ version: 'v1', auth: oauth2Client });
  const gmailService = new GmailService(gmailApi, userId);

  // 3. Fetch sent emails (last 90 days)
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const emails = await gmailService.fetchEmails({
    folder: 'sent',
    since,
    maxResults: 100,
  });

  // 4. Extract contacts
  const extractor = getEntityExtractor();
  const contacts = new Map<string, { name: string; email: string; count: number }>();

  for (const email of emails.emails) {
    const result = await extractor.extractFromEmail(email);

    // Filter person entities
    for (const entity of result.entities) {
      if (entity.type === 'person') {
        const key = entity.normalized;
        const existing = contacts.get(key);
        if (existing) {
          existing.count++;
        } else {
          contacts.set(key, { name: entity.value, email: '', count: 1 });
        }
      }
    }
  }

  // 5. Output results
  console.log('Extracted contacts:');
  for (const [key, contact] of contacts) {
    console.log(`  ${contact.name}: ${contact.count} mentions`);
  }
}

main().catch(console.error);
```

---

## Files Referenced

- `/Users/masa/Projects/izzie2/src/lib/google/gmail.ts`
- `/Users/masa/Projects/izzie2/src/lib/auth/index.ts`
- `/Users/masa/Projects/izzie2/src/lib/ai/client.ts`
- `/Users/masa/Projects/izzie2/src/lib/extraction/entity-extractor.ts`
- `/Users/masa/Projects/izzie2/src/lib/extraction/progress.ts`
- `/Users/masa/Projects/izzie2/src/lib/events/functions/classify-event.ts`
- `/Users/masa/Projects/izzie2/src/lib/events/functions/extract-entities.ts`
- `/Users/masa/Projects/izzie2/scripts/extract-gmail-entities.ts`
- `/Users/masa/Projects/izzie2/package.json`

---

*Research completed by Claude Research Agent*
