# Drive and Contacts Extraction Fix

## Summary

Fixed Google Drive extraction and created Google Contacts extraction scripts to use OAuth tokens instead of service account authentication, matching the pattern used by successful Gmail and Calendar extraction scripts.

## Issues Fixed

### 1. Google Drive Extraction - Service Account Auth Error

**Problem:**
```
Invalid impersonation "sub" field: default
```

The Drive extraction script was using `getServiceAccountAuth(userId)` with `userId` set to "default", which is invalid for service account impersonation.

**Root Cause:**
- Drive script used service account auth with impersonation
- Gmail and Calendar scripts use user OAuth tokens from the database
- The `userId: 'default'` parameter was invalid for impersonation

**Solution:**
Rewrote `scripts/extract-drive-entities.ts` to:
- Use OAuth2Client with user tokens from the database (same as Gmail/Calendar)
- Query users and accounts tables to get OAuth tokens
- Initialize Drive API client with user's access/refresh tokens
- Follow the same pattern as `extract-gmail-entities.ts` and `extract-calendar-entities.ts`

### 2. Google Contacts Extraction - Missing Script

**Problem:**
No contacts extraction script existed to sync Google Contacts data.

**Solution:**
Created new `scripts/extract-contacts-entities.ts` that:
- Uses Google People API v1 to fetch contacts
- Extracts entities from contact information (names, emails, organizations, bios)
- Follows the same OAuth pattern as Gmail/Calendar/Drive scripts
- Includes full entity extraction pipeline (normalization, filtering, deduplication)

## Changes Made

### Modified Files

#### `scripts/extract-drive-entities.ts`
- **Before:** Used service account auth with impersonation
- **After:** Uses OAuth2 tokens from database
- **Key Changes:**
  - Added imports for database, OAuth2Client, and extraction utilities
  - Created `getUsersWithDrive()` to query users with Google OAuth tokens
  - Created `getUserDriveClient()` to initialize Drive API with OAuth tokens
  - Rewrote `extractForUser()` to match Gmail/Calendar extraction pattern
  - Added progress tracking, user identity normalization, and filter statistics
  - Changed command-line args to match other scripts (--user, --limit, --since, --skip-weaviate)

### New Files

#### `scripts/extract-contacts-entities.ts`
- **Purpose:** Extract entities from Google Contacts
- **Features:**
  - Uses Google People API v1 with OAuth2 authentication
  - Fetches contacts with names, emails, phones, organizations, bios
  - Converts contact data to text for entity extraction
  - Full extraction pipeline: normalize → filter → deduplicate → save to Weaviate
  - Progress tracking and error handling
  - Command-line args: --user, --limit, --skip-weaviate

## Authentication Pattern (OAuth vs Service Account)

### Working Pattern (OAuth - Used by All Scripts Now)

```typescript
// 1. Query database for user OAuth tokens
const usersWithGoogle = await db
  .select({
    userId: users.id,
    email: users.email,
    accessToken: accounts.accessToken,
    refreshToken: accounts.refreshToken,
    accessTokenExpiresAt: accounts.accessTokenExpiresAt,
  })
  .from(users)
  .innerJoin(accounts, eq(users.id, accounts.userId))
  .where(eq(accounts.providerId, 'google'));

// 2. Create OAuth2Client with user's tokens
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.NEXT_PUBLIC_APP_URL + '/api/auth/callback/google'
);

oauth2Client.setCredentials({
  access_token: tokens.accessToken,
  refresh_token: tokens.refreshToken,
  expiry_date: tokens.accessTokenExpiresAt?.getTime(),
});

// 3. Initialize API client
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const people = google.people({ version: 'v1', auth: oauth2Client });
```

### Old Pattern (Service Account - Removed from Drive Script)

```typescript
// This was causing the "Invalid impersonation 'sub' field: default" error
const auth = await getServiceAccountAuth('default'); // ❌ WRONG
const driveService = await getDriveService(auth);
```

## Usage

### Google Drive Extraction

```bash
# Extract from all users
npx tsx scripts/extract-drive-entities.ts

# Extract from specific user
npx tsx scripts/extract-drive-entities.ts --user john@example.com

# Limit to 50 documents from last 30 days
npx tsx scripts/extract-drive-entities.ts --limit 50 --since 30

# Skip Weaviate storage (testing only)
npx tsx scripts/extract-drive-entities.ts --skip-weaviate
```

**Options:**
- `--user <email>`: Target specific user by email (default: all users)
- `--limit <number>`: Maximum documents to process (default: 20)
- `--since <days>`: Fetch docs modified in last N days (default: 90)
- `--skip-weaviate`: Skip Weaviate entity storage (testing only)

### Google Contacts Extraction

```bash
# Extract from all users
npx tsx scripts/extract-contacts-entities.ts

# Extract from specific user
npx tsx scripts/extract-contacts-entities.ts --user john@example.com

# Limit to 500 contacts
npx tsx scripts/extract-contacts-entities.ts --limit 500

# Skip Weaviate storage (testing only)
npx tsx scripts/extract-contacts-entities.ts --skip-weaviate
```

**Options:**
- `--user <email>`: Target specific user by email (default: all users)
- `--limit <number>`: Maximum contacts to process (default: 1000)
- `--skip-weaviate`: Skip Weaviate entity storage (testing only)

## Extraction Pipeline

All scripts now follow the same 5-step extraction pipeline:

### 1. Fetch Data
- Gmail: Fetch emails via Gmail API
- Calendar: Fetch events via Calendar API
- Drive: Fetch documents via Drive API + export Google Docs
- Contacts: Fetch contacts via People API

### 2. Extract Entities
- Use `getEntityExtractor()` with user identity context
- Extract Person, Organization, Project entities
- Track extraction cost (OpenAI API usage)

### 3. Normalize User Identity
- Use `normalizeToCurrentUser()` to consolidate "me" entities
- Merge user's own names/emails into single canonical entity
- Prevent duplicate entities for the current user

### 4. Apply Post-Processing Filters
- Use `applyPostFilters()` to remove low-quality entities
- Filter out: email addresses as names, company indicators, single-word names
- Reclassify: Generic titles like "CEO" → Organization entities
- Track filter statistics for reporting

### 5. Deduplicate and Save
- Use `deduplicateWithStats()` to remove duplicate entities
- Save to Weaviate with `saveEntities()`
- Update progress tracking and counters

## Key Features

### Consistent Across All Scripts

1. **OAuth Authentication**: All scripts use user OAuth tokens from database
2. **Progress Tracking**: All use `extraction_progress` table for status
3. **User Identity**: All normalize entities using `getUserIdentity()`
4. **Entity Filtering**: All apply post-processing filters for quality
5. **Deduplication**: All deduplicate entities before saving
6. **Error Handling**: All track failed items and mark errors
7. **Rate Limiting**: All include delays between API calls
8. **Command-Line Interface**: All support --user, --limit, --skip-weaviate flags

### Supported MIME Types (Drive)

- Google Docs: `application/vnd.google-apps.document`
- Google Sheets: `application/vnd.google-apps.spreadsheet`
- Google Slides: `application/vnd.google-apps.presentation`
- Plain text: `text/plain`
- PDF: `application/pdf`

### Contact Fields (Contacts)

- Names
- Email addresses
- Phone numbers
- Organizations
- Biographies
- Occupations
- Relations
- Addresses

## Testing

Run the scripts to verify:

```bash
# Test Drive extraction (should work now)
npx tsx scripts/extract-drive-entities.ts --limit 5 --skip-weaviate

# Test Contacts extraction (should work)
npx tsx scripts/extract-contacts-entities.ts --limit 10 --skip-weaviate
```

Expected output:
- No authentication errors
- Successful OAuth token usage
- Entity extraction and processing
- Filter and deduplication statistics

## LOC Delta

**Drive Script Rewrite:**
- Removed: Service account auth logic (~50 lines)
- Added: OAuth token handling, progress tracking, filtering (~350 lines)
- Net change: +300 lines (comprehensive extraction pipeline)

**Contacts Script Creation:**
- Added: Complete new script (~480 lines)
- Net change: +480 lines (new functionality)

**Total: +780 lines**

## Related Files

- `scripts/extract-gmail-entities.ts` - Reference implementation (OAuth pattern)
- `scripts/extract-calendar-entities.ts` - Reference implementation (OAuth pattern)
- `scripts/extract-drive-entities.ts` - Fixed to use OAuth
- `scripts/extract-contacts-entities.ts` - New script for contacts
- `src/lib/google/auth.ts` - OAuth utilities
- `src/lib/google/drive.ts` - Drive service utilities
- `src/lib/db/schema.ts` - Database schema (users, accounts tables)
- `src/lib/extraction/progress.ts` - Extraction progress tracking
- `src/lib/extraction/user-identity.ts` - User identity normalization
- `src/lib/extraction/post-filters.ts` - Entity quality filters
- `src/lib/extraction/deduplication.ts` - Entity deduplication

## Migration Notes

If you have existing Drive extraction configurations using service account auth:

1. Remove service account configuration
2. Ensure users have completed OAuth flow via the app
3. Verify OAuth tokens are in the database (accounts table)
4. Run new script with `--user` flag to target specific users

## Next Steps

1. Run Drive extraction to verify it works
2. Run Contacts extraction to populate contact entities
3. Verify entities are saved to Weaviate correctly
4. Check extraction progress tracking in database
5. Review filter statistics to tune quality thresholds
