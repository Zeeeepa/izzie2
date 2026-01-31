# Google API Integration Failures - Comprehensive Investigation

**Date:** January 30, 2026
**Issue:** Multiple Google API integrations failing (Tasks, Gmail archiving, Contacts)
**Status:** ROOT CAUSE IDENTIFIED + ADDITIONAL ISSUES FOUND
**Severity:** HIGH - Affects multiple core features

---

## Executive Summary

**Root Cause #1 (Primary):** OAuth scope mismatch - users authenticated before January 27, 2026 have insufficient permissions (`tasks.readonly` instead of `tasks`, `gmail.readonly` instead of `gmail.modify`).

**Root Cause #2 (Secondary):** Inconsistent scope validation - Gmail and Contacts tools do NOT validate write scopes before operations (unlike Tasks tools which properly check).

**Impact:**
- **Tasks**: All write operations fail with helpful error message (scope check implemented)
- **Gmail archiving**: Write operations fail silently (NO scope check implemented)
- **Contacts**: Potentially missing `contacts.readonly` scope (NO scope check implemented)

**Working Services:** Calendar, Email reading - these require only read scopes which users have.

---

## Service-by-Service Analysis

### 1. Google Tasks - NOT RESPONDING

**Status:** Scope validation IMPLEMENTED correctly

**Location:**
- Service: `/src/lib/google/tasks.ts` (485 lines)
- Chat Tools: `/src/lib/chat/tools/tasks.ts` (502 lines)
- Scope Checking: `/src/lib/auth/scopes.ts`

**API Endpoints Used:**
- `https://tasks.googleapis.com/tasks/v1/users/@me/lists` - List task lists
- `https://tasks.googleapis.com/tasks/v1/lists/{tasklistId}/tasks` - CRUD operations

**OAuth Scopes:**
- **Required:** `https://www.googleapis.com/auth/tasks` (full read/write)
- **Problem:** Users have `https://www.googleapis.com/auth/tasks.readonly` (read-only)

**Scope Validation Pattern:**
```typescript
// src/lib/chat/tools/tasks.ts - Lines 49, 143, 325, 405, 466
await requireTasksWriteAccess(userId);  // Throws helpful error if scope insufficient
```

**Why It's Failing:**
1. User authenticated before Jan 27, 2026 with `tasks.readonly`
2. App now requires `tasks` for write operations
3. `requireTasksWriteAccess()` correctly detects this and throws error with reconnection instructions

**Error Message Shown:**
```
Your Google account needs reconnection to enable task management.
You currently have read-only access to tasks.
Please go to Settings > Connections and click "Reconnect" on your Google account
to grant the necessary permissions for creating, updating, and completing tasks.
```

---

### 2. Gmail (Archiving) - NOT RESPONDING

**Status:** Scope validation NOT IMPLEMENTED (ISSUE!)

**Location:**
- Service: `/src/lib/google/gmail.ts` (864 lines)
- Chat Tools: `/src/lib/chat/tools/email.ts`

**API Endpoints Used:**
- `https://gmail.googleapis.com/gmail/v1/users/me/messages` - Read emails
- `https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}/modify` - Archive/label

**OAuth Scopes:**
- **Required for reading:** `https://www.googleapis.com/auth/gmail.readonly`
- **Required for archiving:** `https://www.googleapis.com/auth/gmail.modify`
- **Problem:** Users may have only `gmail.readonly`, not `gmail.modify`

**CRITICAL ISSUE - No Scope Checking:**
```typescript
// src/lib/chat/tools/email.ts - NO SCOPE VALIDATION
// Unlike tasks.ts, email tools do NOT call requireGmailWriteAccess()
// Write operations fail silently without helpful error message
```

**Why It's Failing:**
1. User may have `gmail.readonly` but needs `gmail.modify` for archiving
2. Email tools do NOT validate scopes before write operations
3. API calls fail silently without user-friendly error message

**Comparison - Tasks vs Gmail:**

| Feature | Tasks Tools | Email Tools |
|---------|-------------|-------------|
| Scope check before write | YES (`requireTasksWriteAccess`) | NO |
| Helpful error message | YES (reconnection instructions) | NO |
| Silent failure | NO | YES |

---

### 3. Google Contacts - NOT RESPONDING

**Status:** Scope validation NOT IMPLEMENTED

**Location:**
- Service: `/src/lib/google/contacts.ts` (229 lines)
- Chat Tools: `/src/lib/chat/tools/contacts.ts`

**API Endpoints Used:**
- `https://people.googleapis.com/v1/people/me/connections` - List contacts
- `https://people.googleapis.com/v1/people/{resourceName}` - Get contact details

**OAuth Scopes:**
- **Required:** `https://www.googleapis.com/auth/contacts.readonly`
- **Problem:** Users may be missing this scope entirely

**Operations Implemented:**
- `search_contacts` - Search contacts by name/email
- `get_contact_details` - Get specific contact details
- `sync_contacts` - Sync contacts to local database

**Why It's Failing:**
1. All operations are read-only, so `contacts.readonly` should be sufficient
2. If user authenticated before `contacts.readonly` was added to OAuth config, they won't have it
3. No scope validation means silent failure without helpful error

---

### 4. Calendar - WORKING

**Why It Works:**
- Uses `https://www.googleapis.com/auth/calendar` scope
- User has this scope from original authentication
- Read and write operations both work

---

### 5. Email Reading - WORKING

**Why It Works:**
- Uses `https://www.googleapis.com/auth/gmail.readonly` scope
- User has this scope from original authentication
- Only read operations needed

---

## Root Cause Analysis

### Primary Issue: OAuth Scope Mismatch

**Timeline:**
1. **Before Jan 27, 2026:** App requested `tasks.readonly`, `gmail.readonly`
2. **Jan 27, 2026:** Commit `426787c` upgraded scopes to `tasks`, `gmail.modify`
3. **After upgrade:** New users get correct scopes, existing users keep old scopes
4. **Result:** Existing users cannot perform write operations

**OAuth Configuration (Current):**
```typescript
// src/lib/auth/index.ts (lines 82-97)
scope: [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',    // Needed for archiving
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/tasks',           // Needed for task writes
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
],
```

### Secondary Issue: Inconsistent Scope Validation

**Tasks - GOOD PATTERN:**
```typescript
// src/lib/chat/tools/tasks.ts
export const createTaskTool = {
  async execute(params, userId) {
    await requireTasksWriteAccess(userId);  // <-- VALIDATES SCOPE
    // ... implementation
  }
};
```

**Gmail - MISSING PATTERN:**
```typescript
// src/lib/chat/tools/email.ts
export const archiveEmailTool = {
  async execute(params, userId) {
    // NO SCOPE CHECK <-- ISSUE!
    // ... implementation fails silently if scope missing
  }
};
```

---

## Recommended Fixes

### Immediate Fix (User Action)

1. Navigate to **Settings > Connections**
2. Click **"Reconnect"** on Google account
3. Authorize with new scopes
4. Verify fix: Test task creation, email archiving

### Developer Fix #1: Add Gmail Scope Validation (HIGH PRIORITY)

Create `requireGmailWriteAccess()` function similar to tasks:

```typescript
// src/lib/auth/scopes.ts - ADD THIS

export const INSUFFICIENT_GMAIL_SCOPE_ERROR =
  'Your Google account needs reconnection to enable email management. ' +
  'You currently have read-only access to Gmail. ' +
  'Please go to Settings > Connections and click "Reconnect" on your Google account ' +
  'to grant the necessary permissions for archiving, labeling, and sending emails.';

export async function hasGmailWriteAccess(
  userId: string,
  accountId?: string
): Promise<boolean> {
  const result = await checkUserScopes(userId, accountId);
  return result.hasGmailModify;
}

export async function requireGmailWriteAccess(
  userId: string,
  accountId?: string
): Promise<void> {
  const result = await checkUserScopes(userId, accountId);

  if (!result.hasGmailModify) {
    throw new Error(INSUFFICIENT_GMAIL_SCOPE_ERROR);
  }
}
```

Then update email tools:

```typescript
// src/lib/chat/tools/email.ts - UPDATE

import { requireGmailWriteAccess } from '@/lib/auth/scopes';

export const archiveEmailTool = {
  async execute(params, userId) {
    await requireGmailWriteAccess(userId);  // ADD THIS
    // ... rest of implementation
  }
};

// Add to: archiveEmail, deleteEmail, applyLabel, sendEmail,
// bulkArchive, createDraft, moveEmail, createFilter, deleteFilter
```

### Developer Fix #2: Add Contacts Scope Validation (MEDIUM PRIORITY)

```typescript
// src/lib/auth/scopes.ts - ADD THIS

export const INSUFFICIENT_CONTACTS_SCOPE_ERROR =
  'Your Google account needs reconnection to access contacts. ' +
  'Please go to Settings > Connections and click "Reconnect" on your Google account ' +
  'to grant the necessary permissions for viewing contacts.';

export async function requireContactsAccess(
  userId: string,
  accountId?: string
): Promise<void> {
  const result = await checkUserScopes(userId, accountId);

  if (!result.hasContactsReadonly) {
    throw new Error(INSUFFICIENT_CONTACTS_SCOPE_ERROR);
  }
}
```

### Developer Fix #3: UI Warning Banner (MEDIUM PRIORITY)

Add scope warning component to dashboard:

```typescript
// components/ScopeWarningBanner.tsx
export function ScopeWarningBanner() {
  const { data: scopeCheck } = useSWR('/api/auth/check-scopes');

  if (!scopeCheck?.needsReconnect) return null;

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
      <p>Some features require updated permissions.</p>
      <button onClick={() => startReconnectFlow()}>
        Reconnect Google Account
      </button>
    </div>
  );
}
```

---

## Summary Table

| Service | Status | Root Cause | Scope Check | Fix |
|---------|--------|------------|-------------|-----|
| **Tasks** | NOT RESPONDING | `tasks.readonly` vs `tasks` | YES (good) | User reconnect |
| **Gmail (archive)** | NOT RESPONDING | `gmail.readonly` vs `gmail.modify` | NO (issue) | User reconnect + Add scope check |
| **Contacts** | NOT RESPONDING | Missing `contacts.readonly` | NO (issue) | User reconnect + Add scope check |
| **Calendar** | WORKING | Has correct scope | N/A | None needed |
| **Email (read)** | WORKING | Has `gmail.readonly` | N/A | None needed |

---

## Action Items

### Immediate (User)
- [ ] Reconnect Google account in Settings > Connections
- [ ] Test task creation, email archiving, contacts search

### Short-term (Developer)
- [ ] Add `requireGmailWriteAccess()` to `/src/lib/auth/scopes.ts`
- [ ] Update email tools to validate scopes before write operations
- [ ] Add `requireContactsAccess()` for contacts tools
- [ ] Add UI warning banner for insufficient scopes

### Long-term (Developer)
- [ ] Implement automatic scope upgrade flow
- [ ] Add E2E tests for scope validation
- [ ] Create database migration to flag users with old scopes
- [ ] Monitor and alert on scope-related failures

---

## References

### Key Files
- `/src/lib/auth/index.ts` (lines 82-97) - OAuth configuration
- `/src/lib/auth/scopes.ts` (lines 1-218) - Scope checking utilities (good pattern to follow)
- `/src/lib/google/tasks.ts` (485 lines) - Tasks API implementation
- `/src/lib/google/gmail.ts` (864 lines) - Gmail API implementation
- `/src/lib/google/contacts.ts` (229 lines) - Contacts API implementation
- `/src/lib/chat/tools/tasks.ts` - Tasks chat tools (HAS scope validation)
- `/src/lib/chat/tools/email.ts` - Email chat tools (MISSING scope validation)
- `/src/lib/chat/tools/contacts.ts` - Contacts chat tools (MISSING scope validation)

### Related Research
- `/docs/research/google-tasks-api-investigation-2026-01-28.md` - Original Tasks investigation

---

**Investigation completed:** January 30, 2026
**Confidence level:** HIGH (95%+)
