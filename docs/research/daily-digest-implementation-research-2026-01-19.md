# Daily Digest Implementation Research

**Date:** 2026-01-19
**Ticket:** #33 - Implement daily digest generation
**Epic:** #6 - POC-5 Proactive Event Loop
**Status:** Research Complete

---

## Executive Summary

This research document provides a comprehensive analysis of the existing infrastructure and technical requirements for implementing daily digest generation as part of POC-5 (Proactive Event Loop). The system has strong foundations in email/calendar ingestion, scoring, entity extraction, and Telegram delivery that can be leveraged for digest functionality.

**Key Findings:**
- Existing email scoring system (EmailScorer) provides foundation for 80% relevance target
- Inngest cron infrastructure is well-established for scheduled tasks
- Telegram integration is functional for message delivery
- Notification event infrastructure (`izzie/notification.send`) exists but needs implementation
- User preference storage needs to be added for digest timing/formatting

---

## 1. Parent Epic Requirements Analysis (Issue #6)

### Success Criteria from POC-5
| Metric | Target | Impact on Digest |
|--------|--------|------------------|
| Reliability | 99% | Digest delivery must be highly reliable |
| Relevance Score | 80% | Digest items must meet 80% relevance threshold |
| Action Rate | 50% | Digest content should drive user engagement |

### Technical Requirements from Epic
1. **Upstash Integration** - For long-running scheduled tasks (digest generation can take time)
2. **Daily Digest Generation** - Core deliverable with priority scoring
3. **Notification Aggregation** - Combine multiple signals into cohesive digest
4. **User Preference Management** - Respect user timing and format preferences

---

## 2. Current Infrastructure Analysis

### 2.1 Email/Calendar Data Sources

**GmailService** (`/src/lib/google/gmail.ts`)
- `fetchEmails()` - Paginated email retrieval with filtering
- `getEmail(id)` - Individual email details
- `getThread(threadId)` - Full thread retrieval
- `batchFetch(ids)` - Efficient batch retrieval
- Provides: subject, body, from/to, date, threadId, labels, attachments, snippet

**CalendarService** (`/src/lib/google/calendar.ts`)
- `fetchEvents()` - Paginated event retrieval with time range
- `getEvent(eventId)` - Individual event details
- Provides: summary, description, location, start/end times, attendees, organizer, status

**Data Availability:**
```
Email Data                    Calendar Data
-----------                   -------------
- Subject + Body              - Event Title + Description
- Sender/Recipients           - Attendees
- Thread Context              - Location
- Labels (STARRED, IMPORTANT) - Start/End Times
- Attachments                 - Recurring Event Info
- Date/Time                   - Response Status
```

### 2.2 Existing Scoring System

**EmailScorer** (`/src/lib/scoring/email-scorer.ts`)
- Already implements priority scoring with configurable weights
- Maximum score: 100 points

**Current Scoring Weights:**
```typescript
{
  isSent: 40,              // User actively sent (HIGHEST)
  isReply: 15,             // User replied
  recipientFrequency: 15,  // Frequent contact
  hasStars: 10,            // Explicit importance
  threadDepth: 10,         // Sustained conversation
  hasAttachments: 5,       // Important content
  hasLabels: 5,            // Organization
}
```

**Relevance to 80% Target:**
- Score >= 80 indicates HIGH relevance
- Score 60-79: MEDIUM relevance
- Score < 60: LOW relevance (exclude from digest)

**Gap:** Need calendar event scoring system (doesn't exist)

### 2.3 Inngest Event Infrastructure

**Current Cron Functions:**
| Function | Schedule | Purpose |
|----------|----------|---------|
| `ingest-emails` | `0 * * * *` (hourly) | Fetch new emails |
| `ingest-calendar` | `0 * * * *` (hourly) | Fetch calendar events |
| `ingest-drive` | Hourly | Fetch Drive files |

**Existing Event Types:**
```typescript
// Relevant existing events
'izzie/notification.send'           // Notification delivery
'izzie/scheduling.request'          // Calendar scheduling
'izzie/ingestion.email.extracted'   // Email content extracted
'izzie/ingestion.calendar.extracted' // Calendar event extracted
```

**Notification Schema (Already Defined):**
```typescript
NotificationSendSchema = {
  webhookId: string,
  channel: 'telegram' | 'email',
  recipient: string,
  message: string,
  priority: 'low' | 'normal' | 'high' | 'urgent',
  metadata: Record<string, unknown>,
}
```

### 2.4 Telegram Notification Infrastructure

**TelegramBot** (`/src/lib/telegram/bot.ts`)
- `send(chatId, text, parseMode)` - Send message to user
- Supports HTML, Markdown, MarkdownV2 formatting
- Singleton pattern with environment-based token

**Message Handler** (`/src/lib/telegram/message-handler.ts`)
- Already processes messages for linked users
- Session management via `telegram_sessions` table
- User lookup via `telegram_links` table

**Database Tables:**
```sql
telegram_links (userId, telegramChatId, telegramUsername, linkedAt)
telegram_sessions (telegramChatId, chatSessionId, createdAt)
telegram_link_codes (code, userId, expiresAt, used)
```

### 2.5 User Preference Infrastructure

**Current State:**
- `users.metadata` (JSONB) - Flexible key-value storage exists
- No specific digest preference schema defined

**Gap:** Need to define and implement digest preferences:
- Digest timing (morning/evening/custom)
- Timezone setting
- Digest format preferences
- Notification channel preferences
- Content filtering preferences

---

## 3. Technical Requirements

### 3.1 New Event Types Required

```typescript
// Daily digest events
'izzie/digest.generate': {
  data: {
    userId: string;
    digestType: 'morning' | 'evening' | 'custom';
    scheduledFor: string; // ISO timestamp
  }
}

'izzie/digest.ready': {
  data: {
    userId: string;
    digestId: string;
    itemCount: number;
    priority: 'low' | 'normal' | 'high';
  }
}

'izzie/digest.delivered': {
  data: {
    userId: string;
    digestId: string;
    channel: 'telegram' | 'email';
    deliveredAt: string;
  }
}
```

### 3.2 New Database Tables Required

```sql
-- User digest preferences
CREATE TABLE digest_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  morning_digest_time TIME DEFAULT '08:00:00',
  evening_digest_time TIME DEFAULT '18:00:00',
  timezone TEXT DEFAULT 'UTC',
  delivery_channel TEXT DEFAULT 'telegram',
  min_relevance_score INTEGER DEFAULT 60,
  include_calendar BOOLEAN DEFAULT true,
  include_emails BOOLEAN DEFAULT true,
  include_tasks BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Digest history for tracking
CREATE TABLE digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  digest_type TEXT NOT NULL, -- 'morning' | 'evening' | 'custom'
  generated_at TIMESTAMP DEFAULT now(),
  delivered_at TIMESTAMP,
  delivery_channel TEXT,
  item_count INTEGER,
  status TEXT DEFAULT 'pending', -- pending, delivered, failed
  content JSONB, -- Serialized digest content
  metrics JSONB  -- Open rate, engagement, etc.
);

-- Digest items for analytics
CREATE TABLE digest_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_id UUID NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL, -- 'email' | 'calendar' | 'task' | 'action'
  source_id TEXT,
  relevance_score INTEGER,
  priority TEXT,
  summary TEXT,
  included BOOLEAN DEFAULT true,
  user_action TEXT, -- 'clicked' | 'dismissed' | 'snoozed'
  created_at TIMESTAMP DEFAULT now()
);
```

### 3.3 Digest Content Structure

```typescript
interface DigestContent {
  userId: string;
  generatedAt: Date;
  digestType: 'morning' | 'evening';

  sections: {
    // High-priority items (score >= 80)
    highPriority: DigestItem[];

    // Today's schedule summary
    scheduleSummary: CalendarSummary;

    // Important unread messages
    unreadMessages: EmailSummary[];

    // Upcoming deadlines
    deadlines: DeadlineItem[];

    // Suggested actions
    suggestedActions: ActionItem[];

    // Statistics
    statistics: {
      totalEmails: number;
      totalEvents: number;
      tasksCompleted: number;
      tasksPending: number;
    };
  };

  metadata: {
    itemCount: number;
    avgRelevanceScore: number;
    processingTimeMs: number;
  };
}

interface DigestItem {
  type: 'email' | 'calendar' | 'task' | 'action';
  sourceId: string;
  title: string;
  summary: string;
  relevanceScore: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionRequired: boolean;
  timestamp: Date;
  metadata: Record<string, unknown>;
}
```

### 3.4 Calendar Event Scoring System (New)

```typescript
// New: CalendarScorer to complement EmailScorer
interface CalendarScoringWeights {
  isToday: number;           // 30 - Events happening today
  isTomorrow: number;        // 20 - Events tomorrow
  hasAttendees: number;      // 15 - Meetings with others
  isOrganizer: number;       // 15 - User organized the event
  hasLocation: number;       // 10 - Physical meetings
  isRecurring: number;       // 5  - Recurring events
  responseRequired: number;  // 5  - Needs user response
}

const DEFAULT_CALENDAR_WEIGHTS: CalendarScoringWeights = {
  isToday: 30,
  isTomorrow: 20,
  hasAttendees: 15,
  isOrganizer: 15,
  hasLocation: 10,
  isRecurring: 5,
  responseRequired: 5,
};
```

---

## 4. Recommended Architecture

### 4.1 Component Diagram

```
                     ┌─────────────────────────────────────────┐
                     │           Upstash Scheduler             │
                     │  (Morning 8am / Evening 6pm per user)   │
                     └────────────────┬────────────────────────┘
                                      │
                                      ▼
                     ┌─────────────────────────────────────────┐
                     │      generate-daily-digest (Inngest)    │
                     │  - Fetch user preferences               │
                     │  - Check timezone for execution         │
                     └────────────────┬────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │  Email Fetcher  │    │ Calendar Fetcher│    │  Task Fetcher   │
    │  (GmailService) │    │(CalendarService)│    │(Not implemented)│
    └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
             │                      │                      │
             ▼                      ▼                      ▼
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │  EmailScorer    │    │ CalendarScorer  │    │  TaskScorer     │
    │  (Existing)     │    │ (New)           │    │  (New)          │
    └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
             │                      │                      │
             └──────────────────────┼──────────────────────┘
                                    │
                                    ▼
                     ┌─────────────────────────────────────────┐
                     │        Digest Aggregator Service        │
                     │  - Apply 80% relevance threshold        │
                     │  - Prioritize by score                  │
                     │  - Format sections                      │
                     └────────────────┬────────────────────────┘
                                      │
                                      ▼
                     ┌─────────────────────────────────────────┐
                     │        Digest Formatter Service         │
                     │  - Generate Telegram/Email format       │
                     │  - Apply personalization                │
                     └────────────────┬────────────────────────┘
                                      │
                                      ▼
                     ┌─────────────────────────────────────────┐
                     │    izzie/notification.send (Existing)   │
                     │  - Telegram delivery via TelegramBot    │
                     │  - Email delivery (future)              │
                     └─────────────────────────────────────────┘
```

### 4.2 Execution Flow

```
1. Scheduler Trigger (Upstash)
   └─> Check user timezone: Is it 8am or 6pm local time?
       └─> Yes: Emit 'izzie/digest.generate' event

2. Generate Digest (Inngest Function)
   ├─> Step 1: Fetch user preferences
   │   └─> Get from digest_preferences table
   │
   ├─> Step 2: Fetch data sources (parallel)
   │   ├─> Emails since last digest (using GmailService)
   │   ├─> Calendar events for today/tomorrow (using CalendarService)
   │   └─> Tasks (pending implementation)
   │
   ├─> Step 3: Score all items
   │   ├─> EmailScorer.scoreBatch(emails)
   │   ├─> CalendarScorer.scoreBatch(events)
   │   └─> Filter by min_relevance_score (default: 60)
   │
   ├─> Step 4: Aggregate and prioritize
   │   ├─> Sort by relevance score DESC
   │   ├─> Group into sections (high priority, schedule, etc.)
   │   └─> Apply 80% relevance target for top section
   │
   ├─> Step 5: Format digest content
   │   ├─> Generate summary text
   │   └─> Format for delivery channel (Telegram/Email)
   │
   └─> Step 6: Deliver
       └─> Emit 'izzie/notification.send' with formatted digest
```

---

## 5. Files Requiring Modification

### 5.1 New Files to Create

| File Path | Purpose |
|-----------|---------|
| `src/lib/digest/types.ts` | Digest type definitions |
| `src/lib/digest/aggregator.ts` | Digest aggregation logic |
| `src/lib/digest/formatter.ts` | Format digest for channels |
| `src/lib/digest/preferences.ts` | User preference management |
| `src/lib/scoring/calendar-scorer.ts` | Calendar event scoring |
| `src/lib/events/functions/generate-digest.ts` | Inngest digest function |
| `drizzle/migrations/00XX_add_digest_tables.sql` | Database migration |
| `src/app/api/digest/preferences/route.ts` | Preferences API |
| `src/app/api/digest/preview/route.ts` | Digest preview API |
| `src/app/dashboard/settings/digest/page.tsx` | Digest settings UI |

### 5.2 Existing Files to Modify

| File Path | Modification |
|-----------|--------------|
| `src/lib/events/types.ts` | Add digest event schemas |
| `src/lib/events/functions/index.ts` | Export new digest function |
| `src/lib/events/functions/process-event.ts` | Implement Telegram delivery in `sendNotification` |
| `src/lib/db/schema.ts` | Add digest-related tables |
| `src/lib/scoring/index.ts` | Export CalendarScorer |

---

## 6. Dependencies and Integration Points

### 6.1 External Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| Inngest | Event processing | Already integrated |
| Upstash | Scheduled task management | Mentioned in epic, not implemented |
| googleapis | Email/Calendar access | Already integrated |
| Telegram Bot API | Message delivery | Already integrated |

### 6.2 Internal Service Dependencies

```
DigestService
├── GmailService (existing)
├── CalendarService (existing)
├── EmailScorer (existing)
├── CalendarScorer (new)
├── TelegramBot (existing)
├── UserPreferences (new)
└── DigestStorage (new)
```

### 6.3 Database Dependencies

```
digest_preferences -> users (user_id)
digests -> users (user_id)
digest_items -> digests (digest_id)
```

---

## 7. Implementation Plan

### Phase 1: Foundation (3-4 days)
1. **Database Schema**
   - Create migration for digest_preferences table
   - Create migration for digests and digest_items tables
   - Add schema definitions to `src/lib/db/schema.ts`

2. **Type Definitions**
   - Define DigestContent, DigestItem, DigestPreferences types
   - Add digest event schemas to `src/lib/events/types.ts`

3. **Calendar Scoring**
   - Implement CalendarScorer based on EmailScorer pattern
   - Add tests for scoring logic

### Phase 2: Core Digest Generation (4-5 days)
1. **Digest Aggregator**
   - Implement data fetching from email/calendar
   - Apply scoring and relevance filtering
   - Aggregate into sections
   - Implement 80% relevance threshold logic

2. **Digest Formatter**
   - Create Telegram message format
   - Create email HTML format (future)
   - Personalization based on user name

3. **Inngest Function**
   - Create `generate-digest` function
   - Implement step-based workflow
   - Add error handling and retries

### Phase 3: Delivery & Scheduling (3-4 days)
1. **Notification Delivery**
   - Complete `sendNotification` Telegram implementation
   - Add delivery tracking

2. **User Preferences**
   - Implement preferences API
   - Add settings UI component
   - Default to 8am morning, 6pm evening

3. **Scheduling**
   - Implement timezone-aware scheduling
   - Set up Upstash for reliable cron (or use Inngest cron)

### Phase 4: Polish & Analytics (2-3 days)
1. **Digest Preview**
   - API endpoint for digest preview
   - UI component for preview

2. **Analytics**
   - Track delivery success/failure
   - Track user engagement (if possible)

3. **Testing & Documentation**
   - Integration tests
   - API documentation

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OAuth token expiration | Medium | High | Implement token refresh in GmailService |
| Rate limiting (Gmail API) | Low | Medium | Batch requests, respect rate limits |
| Timezone complexity | Medium | Medium | Use well-tested library (date-fns-tz) |
| Large digest content | Low | Low | Truncate items, paginate if needed |
| Telegram message limits | Medium | Medium | Split long messages, use proper formatting |

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Delivery Reliability | 99% | Track delivered vs attempted |
| Relevance Score | 80%+ average | Calculate avg score of included items |
| User Engagement | 50% action rate | Track clicks/actions from digest |
| Generation Time | < 30 seconds | Measure processing time |
| Error Rate | < 1% | Track failures in Inngest dashboard |

---

## 10. Conclusion

The existing infrastructure provides a solid foundation for daily digest implementation:

**Strengths:**
- Email/Calendar services are fully functional
- Email scoring system meets 80% relevance requirement
- Inngest provides reliable event processing
- Telegram delivery infrastructure exists

**Gaps to Address:**
- Calendar event scoring (new)
- User preference management (new)
- Digest aggregation logic (new)
- Complete `sendNotification` implementation
- Upstash integration for reliable scheduling

**Estimated Total Effort:** 12-16 days

**Recommended Starting Point:** Phase 1 - Database schema and type definitions, then Phase 2 - Core digest generation with existing Inngest cron (can optimize scheduling with Upstash later).

---

## Appendix A: File References

| File | Purpose | Key Exports |
|------|---------|-------------|
| `/src/lib/google/gmail.ts` | Gmail API wrapper | `GmailService`, `getGmailService` |
| `/src/lib/google/calendar.ts` | Calendar API wrapper | `CalendarService`, `getCalendarService` |
| `/src/lib/scoring/email-scorer.ts` | Email scoring | `EmailScorer` |
| `/src/lib/events/functions/ingest-emails.ts` | Email ingestion | `ingestEmails` |
| `/src/lib/events/functions/process-event.ts` | Event processing | `processEvent`, `sendNotification` |
| `/src/lib/telegram/bot.ts` | Telegram client | `TelegramBot`, `getTelegramBot` |
| `/src/lib/telegram/message-handler.ts` | Message handling | `processAndReply` |
| `/src/lib/events/types.ts` | Event definitions | `Events`, `NotificationSendSchema` |

## Appendix B: Existing Event Keys

```typescript
// From src/lib/events/types.ts
'izzie/webhook.received'
'izzie/event.classified'
'izzie/event.processed'
'izzie/notification.send'           // USE THIS FOR DIGEST DELIVERY
'izzie/scheduling.request'
'izzie/ingestion.email.extracted'
'izzie/ingestion.drive.extracted'
'izzie/ingestion.task.extracted'
'izzie/ingestion.calendar.extracted'
'izzie/ingestion.entities.extracted'
'izzie/research.request'
// ... (research events)
```
