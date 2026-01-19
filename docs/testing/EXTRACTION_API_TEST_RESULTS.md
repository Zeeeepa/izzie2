# Gmail Entity Extraction API Test Results

**Date**: 2026-01-17
**Test Script**: `/Users/masa/Projects/izzie2/test-extraction-direct.mjs`

## Summary

The Gmail entity extraction API requires browser authentication and cannot be directly called via curl without session cookies. The system is functioning and has successfully processed emails, though entity extraction encountered issues.

---

## API Endpoint

```
POST http://localhost:3300/api/gmail/sync-user
```

**Requirements**:
- User must be authenticated via better-auth session
- Requires browser cookies (session token)
- Cannot be called directly via curl without auth

**Request Body** (optional):
```json
{
  "folder": "sent",      // "inbox", "sent", or "all"
  "maxResults": 100,     // Number of emails to process
  "since": "2024-01-01"  // Optional date filter
}
```

---

## Database Status

### User Account
- **User**: bob@matsuoka.com
- **User ID**: tlHWmrogZXPR91lqdGO1fXM02j92rVDF
- **OAuth Provider**: Google
- **Access Token**: Valid
- **Refresh Token**: Valid
- **Token Expiration**: 2026-01-17T03:14:40.806Z (valid)

### Extraction Progress

| Source   | Status    | Processed | Total | Entities | Failed | Last Updated          |
|----------|-----------|-----------|-------|----------|--------|-----------------------|
| email    | completed | 1         | 1     | 0        | 3      | 1/17/2026, 1:01:16 AM |
| drive    | running   | 0         | 0     | 0        | 0      | 1/16/2026, 9:35:52 PM |
| calendar | running   | 0         | 0     | 0        | 0      | 1/16/2026, 9:35:52 PM |

**Key Findings**:
- ✅ Email extraction completed successfully
- ⚠️  1 email processed, but **3 emails failed**
- ⚠️  **0 entities extracted** (should have extracted entities from emails)
- ⏸️  Drive and calendar extractions are in "running" state but haven't processed any items

---

## Entity Storage

Entities are **NOT** stored in PostgreSQL. The system uses:

1. **PostgreSQL (Neon)**: Stores user accounts, sessions, extraction progress
2. **Neo4j Graph Database**: Stores extracted entities (people, organizations, events, etc.)

To check extracted entities, you need to query Neo4j directly using:
- Neo4j Browser: `http://localhost:7474`
- Or use the graph query functions in `/src/lib/graph/graph-queries.ts`

---

## How to Trigger Extraction

### Method 1: Browser Console (Recommended)

1. Open http://localhost:3300 in browser
2. Sign in with Google
3. Open browser console (F12)
4. Copy and paste the contents of `trigger-sync.js`
5. Run:
   ```javascript
   triggerSync({ folder: 'sent', maxResults: 10 })
   ```

### Method 2: HTTP Request with Session Cookie

```bash
# Export session cookie from browser
# Then use curl with cookie
curl -X POST http://localhost:3300/api/gmail/sync-user \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"folder":"sent","maxResults":10}'
```

---

## Issues Found

### 1. Entity Extraction Failures
- 3 out of 4 emails failed during extraction
- 0 entities were extracted from the 1 successful email
- Suggests possible issues with:
  - AI extraction logic
  - Neo4j connection
  - Entity extraction error handling

### 2. Stalled Background Jobs
- Drive and calendar extractions show "running" status
- No items processed
- Last updated 12+ hours ago
- Suggests background workers may not be running properly

---

## Next Steps

### To Debug Entity Extraction:
1. Check Next.js server logs for extraction errors:
   ```bash
   # Look for logs in the terminal running `pnpm dev`
   ```

2. Check Neo4j connection:
   ```bash
   # Verify Neo4j is running
   docker ps | grep neo4j
   # Or check localhost:7474
   ```

3. Test entity extraction directly:
   ```typescript
   // Use scripts/test-extraction-api.ts if available
   ```

### To Resume Stalled Extractions:
1. Check extraction status API:
   ```bash
   curl http://localhost:3300/api/extraction/status \
     -H "Cookie: better-auth.session_token=YOUR_TOKEN"
   ```

2. Manually restart extractions:
   ```bash
   curl -X POST http://localhost:3300/api/extraction/resume \
     -H "Cookie: better-auth.session_token=YOUR_TOKEN"
   ```

---

## Files Created

- `/Users/masa/Projects/izzie2/test-extraction-direct.mjs` - Database status checker
- `/Users/masa/Projects/izzie2/list-tables.mjs` - Table lister
- `/Users/masa/Projects/izzie2/EXTRACTION_API_TEST_RESULTS.md` - This file

---

## Database Tables

PostgreSQL tables found:
```
- accounts (OAuth tokens)
- authorization_templates
- consent_history
- conversations
- extraction_progress ← Progress tracking
- memory_entries
- proxy_audit_log
- proxy_authorizations
- proxy_rollbacks
- sessions (auth sessions)
- user_authorization_preferences
- users (user accounts)
- verifications
```

**Note**: No "entities" table - entities are stored in Neo4j graph database.
