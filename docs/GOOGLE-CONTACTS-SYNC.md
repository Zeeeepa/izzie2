# Google Contacts Sync Implementation

## Overview

The Google Contacts sync feature enables Izzie2 to import user contacts from Google People API and extract entities (people, companies) for storage in Weaviate. This provides a high-quality baseline of known entities that can be cross-referenced with emails, calendar events, and other data sources.

## Architecture

### Components

1. **ContactsService** (`/src/lib/google/contacts.ts`)
   - Wraps Google People API v1
   - Provides methods to fetch contacts with pagination
   - Maps Google API response to our `Contact` type

2. **Sync API Endpoint** (`/src/app/api/contacts/sync/route.ts`)
   - POST endpoint to trigger contact synchronization
   - GET endpoint to check sync status
   - Converts contacts to entities and saves to Weaviate
   - Runs sync in background (non-blocking)

3. **Entity Extraction** (in sync route)
   - Converts contacts to `Person` entities with 0.95 confidence
   - Extracts `Company` entities from organization fields with 0.9 confidence
   - Includes context: email, phone, job title, company name

### Data Flow

```
Google People API
       ↓
ContactsService.fetchContacts()
       ↓
Convert to Contact[] type
       ↓
convertContactsToEntities()
       ↓
Person + Company entities
       ↓
saveEntities() → Weaviate
```

## Setup Instructions

### 1. Enable Google People API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one)
3. Navigate to **APIs & Services** → **Library**
4. Search for "People API"
5. Click **Enable**

### 2. Configure OAuth Consent Screen

The OAuth scope `https://www.googleapis.com/auth/contacts.readonly` is already configured in `/src/lib/auth/index.ts` (line 50).

Verify in Google Cloud Console:
1. **APIs & Services** → **OAuth consent screen**
2. Check that "Google People API" is in the list of scopes
3. If not listed, add the scope manually:
   - Click **Edit App**
   - **Scopes** → **Add or Remove Scopes**
   - Filter for `contacts.readonly`
   - Select and save

### 3. Re-authenticate Users

Existing users need to re-authenticate to grant the new contacts permission:

1. Users should sign out: `/api/auth/sign-out`
2. Sign back in: `/api/auth/sign-in/google`
3. Google will show the new permission request for contacts access
4. After approval, the refresh token will include contacts scope

**Note**: The scope is automatically requested for new sign-ups. Only existing users need to re-authenticate.

## Usage

### Via API Endpoint

**Trigger Sync** (POST):
```bash
curl -X POST http://localhost:3300/api/contacts/sync \
  -H "Content-Type: application/json" \
  -H "Cookie: izzie2_session=<session-cookie>" \
  -d '{"maxContacts": 1000}'
```

**Check Status** (GET):
```bash
curl http://localhost:3300/api/contacts/sync \
  -H "Cookie: izzie2_session=<session-cookie>"
```

Response:
```json
{
  "status": {
    "isRunning": false,
    "contactsProcessed": 145,
    "entitiesSaved": 203,
    "lastSync": "2026-01-18T12:34:56Z"
  }
}
```

### Via Test Script

**Basic validation** (no user authentication needed):
```bash
bun run scripts/test-contacts-sync.ts
```

**Full sync test** (requires authenticated user):
```bash
bun run scripts/test-contacts-sync.ts <userId>
```

This will:
1. Fetch up to 10 contacts from Google
2. Convert to entities
3. Save to Weaviate with sourceId `contacts-sync-test`

### Programmatic Usage

```typescript
import { getContactsService } from '@/lib/google/contacts';
import { google } from 'googleapis';
import { getGoogleTokens } from '@/lib/auth';

// Get user's OAuth tokens
const tokens = await getGoogleTokens(userId);

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

oauth2Client.setCredentials({
  access_token: tokens.accessToken,
  refresh_token: tokens.refreshToken || undefined,
});

// Initialize service
const contactsService = await getContactsService(oauth2Client);

// Fetch contacts (with pagination)
const { contacts, nextPageToken, totalContacts } =
  await contactsService.fetchContacts({ pageSize: 100 });

// Or fetch all contacts at once (up to maxContacts)
const allContacts = await contactsService.fetchAllContacts(1000);
```

## Entity Extraction

### Person Entities

Each contact creates a `Person` entity with:

- **Type**: `person`
- **Value**: Display name (e.g., "John Smith")
- **Normalized**: Lowercase full name (e.g., "john smith")
- **Confidence**: 0.95 (high confidence for saved contacts)
- **Source**: `metadata`
- **Context**: Email, phone, job title (e.g., "Email: john@example.com | Phone: +1234567890 | Software Engineer at Acme Corp")

### Company Entities

If a contact has organization info, a `Company` entity is created:

- **Type**: `company`
- **Value**: Company name (e.g., "Acme Corp")
- **Normalized**: Lowercase company name (e.g., "acme corp")
- **Confidence**: 0.9
- **Source**: `metadata`
- **Context**: Relationship to person (e.g., "John Smith works at Acme Corp as Software Engineer")

## API Reference

### ContactsService

#### `fetchContacts(options)`

Fetch a single page of contacts.

**Parameters**:
- `pageSize` (number, default: 100): Number of contacts per page
- `pageToken` (string, optional): Token for next page

**Returns**:
```typescript
{
  contacts: Contact[];
  nextPageToken?: string;
  totalContacts: number;
}
```

#### `fetchAllContacts(maxContacts)`

Fetch all contacts with automatic pagination.

**Parameters**:
- `maxContacts` (number, default: 1000): Maximum contacts to fetch

**Returns**: `Contact[]`

#### `getContact(resourceName)`

Fetch a specific contact by resource name.

**Parameters**:
- `resourceName` (string): Contact resource name (e.g., "people/c1234567890")

**Returns**: `Contact | null`

### Contact Type

```typescript
interface Contact {
  resourceName: string;          // Unique identifier
  displayName: string;           // Full display name
  givenName?: string;            // First name
  familyName?: string;           // Last name
  emails: ContactEmail[];        // Email addresses
  phoneNumbers: ContactPhone[];  // Phone numbers
  organizations: ContactOrganization[]; // Companies
  photoUrl?: string;             // Profile photo URL
  biography?: string;            // Bio/notes
  addresses: ContactAddress[];   // Physical addresses
  birthdays: ContactBirthday[];  // Birthdate info
}
```

## Sync Status

The sync endpoint maintains in-memory status (production should use Redis/database):

```typescript
{
  isRunning: boolean;        // True if sync in progress
  contactsProcessed: number; // Number of contacts fetched
  entitiesSaved: number;     // Number of entities saved to Weaviate
  lastSync?: Date;           // Timestamp of last successful sync
  error?: string;            // Error message if sync failed
}
```

## Rate Limits

Google People API quotas (as of 2026):
- **Reads**: 600 queries per minute per user
- **Daily quota**: 10,000,000 requests per day

Our implementation respects these limits by:
- Using pagination (max 100 contacts per request)
- Not implementing concurrent requests
- Caching contacts in Weaviate to minimize re-syncing

## Error Handling

Common errors and solutions:

### 1. "No Google access token found"
**Cause**: User hasn't authenticated with Google or tokens expired.
**Solution**: User should sign in via `/api/auth/sign-in/google`.

### 2. "People API has not been used in project..."
**Cause**: People API not enabled in Google Cloud Console.
**Solution**: Follow setup instructions above to enable the API.

### 3. "Insufficient Permission"
**Cause**: User hasn't granted contacts permission or needs to re-authenticate.
**Solution**: User should sign out and sign back in to grant new permissions.

### 4. "Token has been expired or revoked"
**Cause**: Refresh token invalid or user revoked access.
**Solution**: User needs to re-authenticate.

## Testing Checklist

- [ ] People API enabled in Google Cloud Console
- [ ] `contacts.readonly` scope in OAuth consent screen
- [ ] Environment variables set (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- [ ] User authenticated with Google (check accounts table for `providerId='google'`)
- [ ] User has contacts in Google Contacts
- [ ] Weaviate is running and accessible
- [ ] Run basic test: `bun run scripts/test-contacts-sync.ts`
- [ ] Run full test: `bun run scripts/test-contacts-sync.ts <userId>`
- [ ] Verify entities in Weaviate: check Person and Company collections

## Monitoring

Monitor sync performance with logs:

```
[Contacts] Fetched 145 contacts
[Contacts Sync] Converted to 203 Person entities
[Weaviate Entities] Saving 203 entities for user abc123...
[Weaviate Entities] Saved 145 person entities to collection 'Person'
[Weaviate Entities] Saved 58 company entities to collection 'Company'
[Contacts Sync] Completed. Processed 145 contacts, saved 203 entities
```

## Future Enhancements

- **Incremental sync**: Use sync tokens to fetch only changed contacts
- **Contact groups**: Import and use Google contact labels/groups
- **Photo storage**: Download and store contact profile photos
- **Relationship extraction**: Parse notes/biography for relationship info
- **Deduplication**: Match contacts with existing entities from emails/calendar
- **Sync scheduling**: Automatic background sync (daily/weekly)
- **Webhook support**: Real-time updates via Google push notifications

## Files Modified

### Created/Updated:
- ✅ `/src/lib/google/contacts.ts` - ContactsService implementation
- ✅ `/src/app/api/contacts/sync/route.ts` - Sync API endpoint
- ✅ `/src/lib/google/types.ts` - Contact type definitions
- ✅ `/scripts/test-contacts-sync.ts` - Test script
- ✅ `/docs/GOOGLE-CONTACTS-SYNC.md` - This documentation

### Already Configured:
- ✅ `/src/lib/auth/index.ts` - OAuth scope already includes `contacts.readonly`

## LOC Delta

```
Added: ~500 lines (contacts.ts, sync route, test script, docs)
Removed: 0 lines
Net Change: +500 lines
```

The implementation follows existing patterns from Gmail and Calendar integrations, ensuring consistency across the codebase.
