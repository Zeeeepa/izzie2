# Email Extraction Failure Tracking Investigation

**Date:** 2026-01-17
**Investigator:** Research Agent
**Context:** 3 emails failed during extraction - investigating error tracking and retrieval

---

## Executive Summary

The email extraction system tracks failed items via a counter in the `extraction_progress` table, but **does not store individual error details or error messages**. Error information is only logged to console output and is not persisted to the database, making post-mortem analysis difficult.

**Key Finding:** There is no mechanism to retrieve the specific error details for the 3 failed emails without access to the Inngest execution logs or application console output.

---

## How Failures Are Tracked

### Database Schema (`extraction_progress` table)

From `/Users/masa/Projects/izzie2/src/lib/db/schema.ts` (lines 492-534):

```typescript
export const extractionProgress = pgTable('extraction_progress', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  source: text('source').notNull(), // 'email' | 'calendar' | 'drive'
  status: text('status').notNull().default('idle'), // 'idle' | 'running' | 'paused' | 'completed' | 'error'

  // Progress counters
  totalItems: integer('total_items').default(0),
  processedItems: integer('processed_items').default(0),
  failedItems: integer('failed_items').default(0),  // ← Only stores count

  // ... other fields
});
```

**Critical Gap:** The `failedItems` field is an integer counter - it only tracks **how many** emails failed, not **which emails** or **why they failed**.

---

## Where `failedItems` Is Incremented

### Location: `src/lib/events/functions/ingest-emails.ts` (lines 261-266)

```typescript
try {
  // ... email processing logic
} catch (error) {
  console.error(`${LOG_PREFIX} Error processing message ${message.id}:`, error);
  await updateCounters(user.userId, 'email', {
    failedItems: currentProgress.failedItems + 1,
  });
}
```

**What happens when an email fails:**
1. Error is logged to console with message ID
2. `failedItems` counter is incremented by 1
3. **No error details are stored in the database**
4. Processing continues with the next email

---

## Error Information Flow

### Console Logging Only

**Per-Message Error** (line 262):
```typescript
console.error(`${LOG_PREFIX} Error processing message ${message.id}:`, error);
```

**Per-User Error** (line 302):
```typescript
console.error(`${LOG_PREFIX} Error processing user ${user.email}:`, error);
await recordSyncError(user.userId, 'gmail', error as Error);
await markExtractionError(user.userId, 'email');
```

### Sync State Error Storage

From `/Users/masa/Projects/izzie2/src/lib/ingestion/sync-state.ts` (lines 209-218):

```typescript
export async function recordSyncError(
  userId: string,
  source: SyncSource,
  error: Error
): Promise<void> {
  await updateSyncState(userId, source, {
    lastError: error.message,  // ← Only stores last error message
    lastSyncTime: new Date(),
  });
}
```

**Note:** This only stores the **last** error message at the user level, not individual email errors. The `lastError` field is stored in `extraction_progress.status = 'error'` but the actual error message is **not persisted** - only referenced in sync state logic (line 62):

```typescript
lastError: row.status === 'error' ? 'Extraction failed' : undefined,
```

---

## Common Failure Scenarios

Based on the code analysis, emails can fail for these reasons:

### 1. **Gmail API Rate Limiting**
- The code implements 100ms delays (line 260) but may still hit rate limits
- Error: `429 Too Many Requests`

### 2. **Message Parsing Errors**
- Malformed email headers (lines 186-193)
- Missing or corrupted base64 body data (lines 196-206)
- Error: `Buffer.from()` failures, null reference errors

### 3. **Entity Extraction Failures**
- LLM API errors (OpenAI/Anthropic timeouts, rate limits)
- Line 232: `extractor.extractFromEmail(email)`
- Error: Network timeouts, API quota exceeded

### 4. **Graph Processing Errors**
- Database write failures (line 240)
- Graph relationship creation errors
- Error: Database connection issues, constraint violations

### 5. **OAuth Token Issues**
- Expired or invalid access tokens
- Refresh token failures
- Error: `401 Unauthorized`, `403 Forbidden`

---

## How to Retrieve Error Details (Current Limitations)

### Option 1: Inngest Dashboard Logs ✅ **RECOMMENDED**

If Inngest is configured (check `INNGEST_EVENT_KEY`):
1. Go to Inngest dashboard: https://app.inngest.com
2. Navigate to the `ingest-emails` function
3. Find the specific execution run
4. View step logs for the exact error messages

**Limitations:**
- Requires Inngest Cloud or self-hosted deployment
- Logs may have retention limits (30-90 days typically)

### Option 2: Application Console Output ⚠️ **LIMITED**

If running locally or with accessible logs:
```bash
# Search application logs for email errors
grep "Error processing message" logs/app.log
grep "\[IngestEmails\]" logs/app.log
```

**Limitations:**
- Only works if logs are persisted to files
- Development environments may not retain logs
- Production logs may be rotated/deleted

### Option 3: Database Query (Partial Information) ⚠️ **INCOMPLETE**

```sql
-- Check extraction progress for failure count
SELECT
  user_id,
  source,
  status,
  failed_items,
  processed_items,
  total_items,
  last_run_at
FROM extraction_progress
WHERE source = 'email' AND failed_items > 0;

-- This only shows THAT failures occurred, not WHY
```

**Limitations:**
- Only shows failure counts, not error details
- Cannot identify which specific emails failed
- No error messages or stack traces

### Option 4: Re-run Extraction with Enhanced Logging ⚠️ **REQUIRES CODE CHANGES**

Temporarily add detailed error logging:
```typescript
catch (error) {
  console.error(`${LOG_PREFIX} Error processing message ${message.id}:`, {
    messageId: message.id,
    subject: subject || 'N/A',
    from: from || 'N/A',
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  // ... rest of error handling
}
```

**Limitations:**
- Requires code modification and redeployment
- Only captures future errors, not historical ones
- May still miss errors if extraction is paused

---

## Recommendations for Improvement

### 1. **Add Error Detail Storage (High Priority)**

Create an `extraction_errors` table:

```typescript
export const extractionErrors = pgTable('extraction_errors', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  source: text('source').notNull(), // 'email' | 'calendar' | 'drive'
  itemId: text('item_id').notNull(), // Gmail message ID, calendar event ID, etc.
  errorMessage: text('error_message').notNull(),
  errorStack: text('error_stack'),
  errorType: text('error_type'), // 'rate_limit', 'parse_error', 'extraction_error', etc.
  attemptNumber: integer('attempt_number').default(1),
  metadata: jsonb('metadata'), // Store email subject, from, date for context
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Benefits:**
- Historical error tracking
- Ability to identify patterns (e.g., specific senders causing issues)
- Support for retry logic
- Detailed error analysis

### 2. **Implement Structured Error Logging (Medium Priority)**

Use a structured logging library (e.g., Pino, Winston):

```typescript
logger.error({
  context: 'ingest-emails',
  userId: user.userId,
  messageId: message.id,
  subject: subject,
  error: error.message,
  stack: error.stack,
}, 'Failed to process email');
```

### 3. **Add Error Retry Mechanism (Medium Priority)**

Store failed email IDs for retry:
- On failure, add message ID to retry queue
- Implement exponential backoff
- Limit retry attempts (e.g., max 3 attempts)

### 4. **Enhance Progress Tracking (Low Priority)**

Add fields to `extraction_progress`:
```typescript
lastError: text('last_error'),
lastErrorAt: timestamp('last_error_at'),
errorSummary: jsonb('error_summary').$type<{
  rateLimitErrors: number;
  parseErrors: number;
  extractionErrors: number;
  otherErrors: number;
}>(),
```

---

## Immediate Action Items

### For the Current 3 Failed Emails:

1. **Check Inngest Dashboard:**
   - Visit https://app.inngest.com
   - Find the latest `ingest-emails` execution
   - Review step logs for error details

2. **Query Database for Context:**
   ```sql
   SELECT * FROM extraction_progress
   WHERE source = 'email' AND failed_items = 3;
   ```

3. **Check Application Logs:**
   ```bash
   # If running locally or with log access
   tail -f logs/app.log | grep "Error processing message"
   ```

4. **Consider Re-running:**
   - If errors were transient (rate limits, network issues), re-running may succeed
   - Check extraction status before re-running to avoid duplicates

---

## Technical Debt Assessment

**Severity:** Medium
**Impact:** Moderate - Failures are counted but not diagnosed
**Effort to Fix:** Medium (1-2 days for error table + logging enhancement)

**Current State:**
- ❌ No persistent error details
- ❌ No individual failure tracking
- ✅ Failure count is tracked
- ✅ Overall extraction status is tracked

**Desired State:**
- ✅ Persistent error details in database
- ✅ Individual failure tracking with context
- ✅ Structured error categorization
- ✅ Retry mechanism for transient failures

---

## Conclusion

The 3 failed emails during extraction are counted in `extraction_progress.failedItems` but **detailed error information is not stored**. Error messages were logged to console output at the time of failure but are not retrievable from the database.

**To diagnose the failures:**
1. Check Inngest dashboard execution logs (most reliable)
2. Search application console output if available
3. Consider implementing the recommended error tracking table

**Root Cause of Investigation Difficulty:**
The system was designed for progress tracking, not error diagnostics. Error details are ephemeral (console-only), making post-mortem analysis nearly impossible without execution logs.
