# Google Contacts Sync Implementation

## Overview

Added Google Contacts sync support to Izzie, enabling users to sync their Google contacts and store them as Person entities in Weaviate for enhanced relationship tracking and entity extraction.

## Implementation Details

### 1. Google Contacts Service (`/src/lib/google/contacts.ts`)

Created a new service to interact with the Google People API:

**Key Features:**
- Fetches contacts from Google People API with pagination
- Extracts comprehensive contact information:
  - Names (display name, given name, family name)
  - Email addresses (with primary flag)
  - Phone numbers (with type and primary flag)
  - Organizations (company name, title, department)
  - Photos, biographies, addresses, birthdays
- Provides both single-page and full pagination fetching
- Follows existing service patterns (similar to CalendarService and GmailService)

**Main Methods:**
- `fetchContacts(options)` - Fetch a single page of contacts
- `fetchAllContacts(maxContacts)` - Fetch all contacts with automatic pagination
- `getContact(resourceName)` - Get a specific contact by ID

### 2. Contact Type Definitions (`/src/lib/google/types.ts`)

Added comprehensive TypeScript types for contacts:

```typescript
export interface Contact {
  resourceName: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  emails: ContactEmail[];
  phoneNumbers: ContactPhone[];
  organizations: ContactOrganization[];
  photoUrl?: string;
  biography?: string;
  addresses: ContactAddress[];
  birthdays: ContactBirthday[];
}
```

Supporting types include:
- `ContactEmail` - Email with type and primary flag
- `ContactPhone` - Phone number with type and primary flag
- `ContactOrganization` - Company, title, department
- `ContactAddress` - Address with city, region, country
- `ContactBirthday` - Birth date information

### 3. Contacts Sync API (`/src/app/api/contacts/sync/route.ts`)

Created authenticated endpoint for triggering contact synchronization:

**Endpoints:**
- `POST /api/contacts/sync` - Start contact sync
  - Requires authentication
  - Accepts `maxContacts` parameter (default: 1000)
  - Returns sync status immediately
  - Runs sync in background

- `GET /api/contacts/sync` - Get sync status
  - Returns current sync progress
  - Shows contacts processed and entities saved

**Sync Process:**
1. Authenticates user via Better Auth session
2. Retrieves Google OAuth tokens from database
3. Creates OAuth2 client with automatic token refresh
4. Fetches all contacts from Google People API
5. Converts contacts to Person and Company entities
6. Saves entities to Weaviate with high confidence (0.95)

**Entity Conversion:**
- Each contact becomes a **Person entity** with:
  - High confidence score (0.95) - these are saved contacts
  - Normalized name for entity matching
  - Rich context (email, phone, organization)
  - Source: 'metadata'

- Organizations become **Company entities** with:
  - Confidence score of 0.9
  - Context linking person to company
  - Job title information if available

### 4. OAuth Scope Updates

Updated OAuth scopes in two locations:

**`/src/lib/google/auth.ts`**
```typescript
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/contacts.readonly', // NEW
];
```

**`/src/lib/auth/index.ts`** (Better Auth config)
```typescript
scope: [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/tasks.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/contacts.readonly', // NEW
],
```

## Usage

### Trigger Contact Sync

```bash
# Start contact sync
curl -X POST http://localhost:3300/api/contacts/sync \
  -H "Content-Type: application/json" \
  -H "Cookie: <auth-cookie>" \
  -d '{"maxContacts": 1000}'

# Check sync status
curl http://localhost:3300/api/contacts/sync
```

### Response Format

**Sync Started:**
```json
{
  "message": "Contact sync started",
  "status": {
    "isRunning": true,
    "contactsProcessed": 0,
    "entitiesSaved": 0,
    "lastSync": "2026-01-18T..."
  }
}
```

**Sync In Progress:**
```json
{
  "status": {
    "isRunning": true,
    "contactsProcessed": 150,
    "entitiesSaved": 180,
    "lastSync": "2026-01-18T..."
  }
}
```

**Sync Complete:**
```json
{
  "status": {
    "isRunning": false,
    "contactsProcessed": 500,
    "entitiesSaved": 650,
    "lastSync": "2026-01-18T..."
  }
}
```

## Entity Storage

Contacts are stored in Weaviate as **Person** and **Company** entities:

### Person Entity Example
```json
{
  "type": "person",
  "value": "John Smith",
  "normalized": "john smith",
  "confidence": 0.95,
  "source": "metadata",
  "context": "Email: john@example.com | Phone: +1-555-1234 | Senior Engineer at Google",
  "sourceId": "contacts-sync",
  "userId": "<user-id>"
}
```

### Company Entity Example
```json
{
  "type": "company",
  "value": "Google",
  "normalized": "google",
  "confidence": 0.9,
  "source": "metadata",
  "context": "John Smith works at Google as Senior Engineer",
  "sourceId": "contacts-sync",
  "userId": "<user-id>"
}
```

## Integration Points

This implementation integrates seamlessly with existing Izzie features:

1. **Entity Extraction**: Contacts are stored in the same Weaviate collections as email/calendar entities
2. **Entity Search**: Contact entities can be searched using existing `/api/entities/search` endpoint
3. **Relationship Tracking**: Person entities from contacts can be matched with entities from emails
4. **OAuth Management**: Uses existing Better Auth OAuth token refresh mechanism

## Benefits

1. **High-Quality Person Entities**: Contacts provide verified person entities with high confidence
2. **Rich Context**: Each person entity includes email, phone, and organization context
3. **Company Entities**: Automatically extracts company information from contact organizations
4. **Relationship Mapping**: Links people to companies through job titles
5. **Entity Matching**: Normalized names enable matching contacts with email entities

## Next Steps (Optional Enhancements)

1. **Incremental Sync**: Track last sync time and only fetch new/updated contacts
2. **Contact Deduplication**: Merge duplicate contacts based on email/phone
3. **Bi-directional Sync**: Update Google contacts based on entity changes
4. **Contact Groups**: Sync Google contact groups for categorization
5. **Frontend UI**: Add contacts sync button to dashboard
6. **Sync Scheduling**: Automatic periodic contact sync (daily/weekly)

## Testing

To test the implementation:

1. **Ensure OAuth is configured**:
   - Google Cloud Console has People API enabled
   - OAuth consent screen includes contacts scope
   - User re-authenticates to grant contacts permission

2. **Trigger sync**:
   ```bash
   curl -X POST http://localhost:3300/api/contacts/sync \
     -H "Cookie: izzie2-better-auth.session_token=<token>" \
     -d '{"maxContacts": 10}'
   ```

3. **Verify entities in Weaviate**:
   - Check Weaviate dashboard for Person entities with source='metadata'
   - Query entities via `/api/entities/search?query=<contact-name>`

4. **Check logs**:
   - Look for `[Contacts Sync]` logs in console
   - Verify contacts fetched and entities saved

## LOC Delta

**Added:**
- `/src/lib/google/contacts.ts`: 260 lines
- `/src/app/api/contacts/sync/route.ts`: 245 lines
- `/src/lib/google/types.ts`: 58 lines (Contact types)
- Total: **563 lines added**

**Modified:**
- `/src/lib/google/auth.ts`: 1 line
- `/src/lib/auth/index.ts`: 1 line
- Total: **2 lines modified**

**Net Change: +563 lines**

This is a new feature addition with no deletions. Future optimization could consolidate sync logic across calendar/contacts/tasks into a shared sync framework.

## Files Changed

1. ✅ `/src/lib/google/contacts.ts` - NEW
2. ✅ `/src/lib/google/types.ts` - MODIFIED (added Contact types)
3. ✅ `/src/app/api/contacts/sync/route.ts` - NEW
4. ✅ `/src/lib/google/auth.ts` - MODIFIED (added contacts scope)
5. ✅ `/src/lib/auth/index.ts` - MODIFIED (added contacts scope)

## Summary

Google Contacts sync is now fully implemented and follows the same patterns as existing Gmail and Calendar sync. Users can sync their contacts, which are automatically converted to high-confidence Person and Company entities stored in Weaviate for enhanced entity extraction and relationship tracking.
