# Gmail Extraction: Sent-Only Filter Implementation

## Problem
Entity extraction was creating too much noise by processing ALL emails including:
- Spam and junk mail
- Newsletters and promotional content
- Automated system emails
- Social media notifications

This resulted in low-quality entity extraction with irrelevant people, organizations, and topics.

## Solution
Changed the default extraction behavior to **only process SENT emails** - the user's own communications. This provides high-signal entity extraction because sent emails contain entities the user actually cares about:
- People they email and work with
- Projects they mention in their communications
- Companies and organizations they interact with
- Topics they actively discuss

## Changes Made

### 1. API Endpoints - Already Correct ✅
The following files already defaulted to `'sent'` emails:
- `/src/app/api/gmail/sync/route.ts` - Line 40: `folder = 'sent'`
- `/src/app/api/test/batch-extract/route.ts` - Line 40: `folder = 'sent'`
- `/src/app/api/gmail/sync-user/route.ts` - Default to `'sent'`

### 2. Test Endpoint - Updated
**File:** `/src/app/api/gmail/test/route.ts`
- **Changed:** Line 19 - Default folder from `'inbox'` to `'sent'`
- **Reason:** Test endpoint should default to high-signal behavior

```typescript
// BEFORE
const folder = (searchParams.get('folder') || 'inbox') as 'inbox' | 'sent' | 'all';

// AFTER
const folder = (searchParams.get('folder') || 'sent') as 'inbox' | 'sent' | 'all'; // Default to SENT emails (high-signal)
```

### 3. CLI Extraction Script - Enhanced
**File:** `/scripts/extract-gmail-entities.ts`

**Added:**
- `--folder` parameter support (inbox, sent, all)
- Folder validation in argument parser
- Default to `'sent'` folder
- Gmail query construction with folder filters
- Descriptive logging showing folder selection

**Changes:**
1. **Args interface** - Added `folder: 'inbox' | 'sent' | 'all'` field
2. **parseArgs()** - Default `folder: 'sent'`, added `--folder` argument parsing
3. **showHelp()** - Added folder parameter documentation and examples
4. **extractForUser()** - Added folder to options interface and query building

**Query Construction:**
```typescript
// Build Gmail query with folder filter
if (options.folder === 'inbox') {
  queryParts.push('in:inbox');
} else if (options.folder === 'sent') {
  queryParts.push('in:sent');
}
// 'all' means no folder filter

// Always exclude spam and trash
queryParts.push('-label:spam');
queryParts.push('-label:trash');

const query = queryParts.join(' ');
```

**Example Usage:**
```bash
# Extract sent emails (default, high-signal)
npx tsx scripts/extract-gmail-entities.ts

# Extract inbox emails (may include newsletters/spam)
npx tsx scripts/extract-gmail-entities.ts --folder inbox

# Extract all emails (not recommended)
npx tsx scripts/extract-gmail-entities.ts --folder all
```

### 4. Gmail Service Library - Already Correct ✅
**File:** `/src/lib/google/gmail.ts`

The `buildQuery()` method (lines 338-375) already implements proper folder filtering:
- `folder === 'inbox'` → `in:inbox`
- `folder === 'sent'` → `in:sent`
- `folder === 'all'` → no folder filter
- Always excludes spam and trash: `-label:spam -label:trash`

### 5. Inngest Entity Extraction - No Changes Needed ✅
**File:** `/src/lib/events/functions/extract-entities.ts`

The extraction functions process events triggered by the API endpoints, which already default to `'sent'` emails. No changes needed.

## Folder Filter Behavior

### 'sent' (Default - Recommended)
- **Query:** `in:sent -label:spam -label:trash`
- **Contains:** Emails the user sent
- **Quality:** HIGH-SIGNAL - user's own communications
- **Use Case:** Production entity extraction

### 'inbox'
- **Query:** `in:inbox -label:spam -label:trash`
- **Contains:** Emails user received
- **Quality:** MIXED - includes newsletters, automated emails
- **Use Case:** Extracting from important received emails

### 'all'
- **Query:** `-label:spam -label:trash` (no folder filter)
- **Contains:** All emails except spam/trash
- **Quality:** LOW-SIGNAL - includes promotions, social, etc.
- **Use Case:** Comprehensive backup, testing only

## User Override
All extraction endpoints support folder parameter override:

**API Endpoints:**
```bash
POST /api/gmail/sync
{
  "folder": "inbox",  // Override to inbox
  "maxResults": 100
}
```

**CLI Script:**
```bash
npx tsx scripts/extract-gmail-entities.ts --folder inbox
```

**Test Endpoint:**
```bash
GET /api/gmail/test?folder=inbox
```

## Default Behavior Summary

| Component | Default Folder | High-Signal? | Status |
|-----------|---------------|--------------|--------|
| `/api/gmail/sync` | `sent` | ✅ Yes | Already correct |
| `/api/gmail/sync-user` | `sent` | ✅ Yes | Already correct |
| `/api/test/batch-extract` | `sent` | ✅ Yes | Already correct |
| `/api/gmail/test` | `sent` | ✅ Yes | **Updated** |
| `extract-gmail-entities.ts` | `sent` | ✅ Yes | **Enhanced** |

## Benefits

### Before (inbox/all)
- ❌ Extracts from spam, newsletters, promotions
- ❌ Low-quality entities (unsubscribe links, marketing contacts)
- ❌ Noise from automated emails
- ❌ Irrelevant companies and topics

### After (sent only)
- ✅ Extracts only from user's own emails
- ✅ High-quality entities (actual contacts and collaborators)
- ✅ Relevant projects and topics
- ✅ Real companies and organizations user works with
- ✅ Actionable relationship intelligence

## Testing

### Verify Default Behavior
```bash
# CLI extraction (should default to sent)
npx tsx scripts/extract-gmail-entities.ts --limit 10

# Check logs for: "📁 Folder: sent (HIGH-SIGNAL: user's own communications)"
```

### Test Folder Override
```bash
# Extract from inbox instead
npx tsx scripts/extract-gmail-entities.ts --folder inbox --limit 10

# Check logs for: "📁 Folder: inbox (may include newsletters/spam)"
```

### API Testing
```bash
# Test endpoint (should default to sent)
curl http://localhost:3300/api/gmail/test?maxResults=5

# Override to inbox
curl http://localhost:3300/api/gmail/test?folder=inbox&maxResults=5
```

## Migration Notes

### For Existing Users
- **No action needed** - Most endpoints already defaulted to `'sent'`
- **CLI users** - No breaking changes, new `--folder` parameter is optional
- **Existing data** - Previously extracted inbox/all data remains unchanged

### Re-extraction Recommendation
If you previously extracted from inbox or all emails, consider re-running extraction with sent-only filter for higher quality entities:

```bash
# Clear existing extractions (optional)
# Then re-extract with high-signal sent emails
npx tsx scripts/extract-gmail-entities.ts --incremental
```

## LOC Delta
- **Added:** ~45 lines (folder parameter, validation, query building, logging)
- **Modified:** ~15 lines (arg parsing, function signatures)
- **Deleted:** 0 lines
- **Net Change:** +45 lines (improved quality and flexibility)

## Related Files
- `/src/app/api/gmail/sync/route.ts` - Gmail sync API endpoint
- `/src/app/api/gmail/test/route.ts` - Gmail test endpoint
- `/src/lib/google/gmail.ts` - Gmail service with query building
- `/scripts/extract-gmail-entities.ts` - CLI extraction script
- `/src/lib/events/functions/extract-entities.ts` - Inngest extraction functions
