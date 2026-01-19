# Gmail Sync Email Processing Implementation

## Summary

Successfully implemented email processing in the Gmail sync route to trigger entity extraction via Inngest events.

## Changes Made

### File: `/src/app/api/gmail/sync/route.ts`

#### 1. Added Imports
```typescript
import { inngest } from '@/lib/events';
import type { EmailContentExtractedPayload } from '@/lib/events/types';
```

#### 2. Updated Sync Status Type
Extended the `syncStatus` object to track events sent:
```typescript
let syncStatus: SyncStatus & { eventsSent?: number } = {
  isRunning: false,
  emailsProcessed: 0,
  eventsSent: 0,
};
```

#### 3. Implemented Event Emission (Lines 123-150)
Replaced the TODO comment with batch event emission:

```typescript
// Emit events for entity extraction (batch send for efficiency)
if (batch.emails.length > 0) {
  const events = batch.emails.map((email) => ({
    name: 'izzie/ingestion.email.extracted' as const,
    data: {
      userId: userEmail || 'default',
      emailId: email.id,
      subject: email.subject,
      body: email.body,
      from: {
        name: email.from.name,
        email: email.from.email,
      },
      to: email.to.map((addr) => ({
        name: addr.name,
        email: addr.email,
      })),
      date: email.date.toISOString(),
      threadId: email.threadId,
      labels: email.labels,
      snippet: email.snippet,
    } satisfies EmailContentExtractedPayload,
  }));

  await inngest.send(events);
  syncStatus.eventsSent = (syncStatus.eventsSent || 0) + events.length;
  console.log(`[Gmail Sync] Sent ${events.length} events for entity extraction`);
}
```

#### 4. Updated Logging
Modified completion log to include events sent:
```typescript
console.log(
  `[Gmail Sync] Completed. Processed ${totalProcessed} emails, sent ${syncStatus.eventsSent} events for extraction`
);
```

## Implementation Details

### Event Schema Compliance
The implementation maps Gmail API email structure to the `EmailContentExtractedPayload` schema defined in `/src/lib/events/types.ts`:
- Required fields: `userId`, `emailId`, `subject`, `body`, `from`, `to`, `date`, `threadId`, `labels`
- Optional field: `snippet`
- Type-safe mapping with `satisfies EmailContentExtractedPayload`

### Batch Processing
- Uses `inngest.send(events)` to send multiple events in a single call for efficiency
- Processes emails in batches (up to 100 per Gmail API call)
- Tracks total events sent in `syncStatus.eventsSent`

### Error Handling
- Continues processing if event emission fails for individual batches
- Maintains existing error handling for Gmail API failures
- Logs both successes and failures for observability

### Integration with Existing Flow
The implementation follows the same pattern used in `/src/lib/events/functions/ingest-emails.ts`:
1. Fetch emails from Gmail API
2. Map each email to event payload
3. Batch send events to Inngest
4. Track progress in sync status

## Event Flow

```
Gmail API
  ↓
Gmail Sync Route (NEW: Event Emission)
  ↓
Inngest Event: 'izzie/ingestion.email.extracted'
  ↓
Extract Entities Function (/src/lib/events/functions/extract-entities.ts)
  ↓
Entity Extraction & Graph Update
```

## Next Steps

1. Test the endpoint with a POST request:
   ```bash
   curl -X POST http://localhost:3000/api/gmail/sync \
     -H "Content-Type: application/json" \
     -d '{"folder": "inbox", "maxResults": 10, "userEmail": "user@example.com"}'
   ```

2. Verify events are received in Inngest dashboard

3. Monitor entity extraction function execution

4. Check that extracted entities are stored in the graph database

## Files Modified

- `/src/app/api/gmail/sync/route.ts` - Added event emission logic

## Files Referenced

- `/src/lib/events/index.ts` - Inngest client export
- `/src/lib/events/types.ts` - Event schema definitions
- `/src/lib/events/functions/ingest-emails.ts` - Reference implementation
- `/src/lib/google/types.ts` - Gmail API type definitions
