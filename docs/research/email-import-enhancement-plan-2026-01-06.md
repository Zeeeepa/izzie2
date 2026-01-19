# Email Import Enhancement Plan

**Research Date:** 2026-01-06
**Scope:** Enhanced email import pipeline with spam filtering, entity extraction, pattern recognition, and custom filtering
**Target:** Last 30 days of email data

---

## Current Capabilities Analysis

### ✅ Gmail Import (src/lib/google/gmail.ts)
- **Fetches emails** with pagination and date filtering
- **Supports folders:** inbox, sent, all
- **NO spam filtering** - currently fetches from all folders without excluding spam
- **Label-based filtering** via Gmail API labels
- **Rate limiting** with 100ms delays between requests
- **Thread support** for conversation tracking

**Gap:** No spam exclusion filter implemented

### ✅ Entity Extraction (src/lib/extraction/)
**Current entities extracted:**
- ✅ `person` - People's names (from headers + body)
- ✅ `company` - Organizations
- ✅ `project` - Project names
- ✅ `date` - Dates and deadlines
- ✅ `topic` - Subject areas and themes
- ✅ `location` - Geographic locations

**Capabilities:**
- Batch processing with progress tracking
- Cost tracking ($0.000002/email estimated)
- Frequency analysis (entity occurrence counting)
- Co-occurrence tracking (which entities appear together)
- Confidence thresholds (default: 0.7)
- Source attribution (metadata/subject/body)

**Missing:** Action items extraction

### ✅ Email Ingestion Pipeline (src/lib/events/functions/ingest-emails.ts)
- Hourly cron job for new emails
- Sync state tracking (last sync time)
- Event-driven architecture (Inngest)
- Error handling with retries (3x)
- Emits `izzie/ingestion.email.extracted` events

### ❌ Pattern Recognition & Filtering
**Current state:** DOES NOT EXIST
- No pattern storage in database schema
- No filter rule generation
- No custom filtering logic
- No AI-based spam detection

---

## Gaps to Fill

### 1. Spam Handling (HIGH PRIORITY)
**Gmail API level:**
- Add `SPAM` label exclusion to `buildQuery()` in gmail.ts
- Add query filter: `-label:spam`

**AI-based spam detection (secondary filter):**
- Create spam classifier using Mistral Small
- Score emails 0-1 for spam probability
- Configurable threshold (default: 0.8)
- Store spam scores in metadata

### 2. Action Items Extraction (MEDIUM PRIORITY)
**Add new entity type:**
- `action_item` - TODOs, tasks, requests, deadlines
- Extract: "Please review by Friday", "Can you send me the report?"
- Include: assignee, deadline, priority indicators
- Source attribution (body/subject)

**Update types:**
```typescript
export type EntityType =
  | 'person'
  | 'company'
  | 'project'
  | 'date'
  | 'topic'
  | 'location'
  | 'action_item'; // NEW

export interface ActionItemEntity extends Entity {
  type: 'action_item';
  assignee?: string; // Who needs to do it
  deadline?: string; // When it's due
  priority?: 'low' | 'medium' | 'high'; // Urgency
}
```

### 3. Pattern Storage Schema (HIGH PRIORITY)
**Add to schema.ts:**
```typescript
export const emailPatterns = pgTable('email_patterns', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),

  // Pattern identification
  patternType: text('pattern_type').notNull(), // 'entity_frequency', 'sender_frequency', 'time_pattern', 'topic_cluster'
  patternKey: text('pattern_key').notNull(), // e.g., 'person:john_doe', 'sender:boss@company.com'

  // Statistics
  frequency: integer('frequency').notNull(), // How often pattern occurs
  firstSeen: timestamp('first_seen').notNull(),
  lastSeen: timestamp('last_seen').notNull(),

  // Pattern metadata
  metadata: jsonb('metadata').$type<{
    emailIds?: string[];
    avgImportance?: number;
    timeOfDay?: string; // Morning/afternoon/evening pattern
    dayOfWeek?: string; // Which days this pattern appears
  }>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailFilters = pgTable('email_filters', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),

  // Filter definition
  name: text('name').notNull(), // "Work emails from boss"
  description: text('description'),

  // Filter rules (JSON for flexibility)
  rules: jsonb('rules').$type<{
    entityFilters?: Array<{ entityType: string; entityValue: string }>;
    senderFilters?: string[]; // Email addresses
    subjectPatterns?: string[]; // Regex patterns
    bodyPatterns?: string[];
    dateRange?: { start?: string; end?: string };
    minImportance?: number;
  }>(),

  // Actions to take when filter matches
  actions: jsonb('actions').$type<{
    label?: string; // Apply custom label
    priority?: 'low' | 'medium' | 'high';
    autoArchive?: boolean;
    notifyUser?: boolean;
  }>(),

  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### 4. Pattern Recognition Logic (MEDIUM PRIORITY)
**Create pattern analyzer:**
- Analyze extraction results for patterns
- Identify frequent senders, topics, entities
- Detect time-based patterns (morning/evening, weekday/weekend)
- Calculate importance scores based on frequency + recency
- Generate filter suggestions based on patterns

---

## Implementation Plan

### Phase 1: Spam Filtering (Week 1)
**Goals:**
- Exclude Gmail spam folder from imports
- Add AI-based spam detection as secondary filter

**Tasks:**
1. Update `buildQuery()` in gmail.ts to exclude SPAM label
2. Create `SpamClassifier` in `src/lib/spam/classifier.ts`
3. Add spam scoring to email ingestion pipeline
4. Store spam scores in `memoryEntries.metadata.spamScore`
5. Add configuration for spam threshold (default: 0.8)

**Cost estimate:** ~$0.000003/email for spam classification

### Phase 2: Action Items Extraction (Week 2)
**Goals:**
- Extract action items from emails
- Identify assignees, deadlines, priorities

**Tasks:**
1. Add `action_item` entity type to extraction types
2. Update extraction prompts to include action items
3. Add action item parsing logic to entity-extractor.ts
4. Test extraction accuracy on sample emails
5. Add action items to extraction stats

**Cost estimate:** No additional cost (same extraction call)

### Phase 3: Pattern Storage & Analysis (Week 3)
**Goals:**
- Store patterns in database
- Analyze extraction results for patterns
- Generate filter suggestions

**Tasks:**
1. Add `emailPatterns` and `emailFilters` tables to schema
2. Create migration for new tables
3. Create `PatternAnalyzer` in `src/lib/patterns/analyzer.ts`
4. Build pattern detection logic:
   - Entity frequency patterns
   - Sender frequency patterns
   - Time-based patterns
   - Topic clustering
5. Store patterns in database during ingestion

### Phase 4: Custom Filtering (Week 4)
**Goals:**
- Enable user-defined filters based on patterns
- Auto-apply filters during ingestion

**Tasks:**
1. Create `FilterEngine` in `src/lib/filters/engine.ts`
2. Implement filter rule matching logic
3. Add filter application to ingestion pipeline
4. Create API endpoints for filter CRUD operations
5. Build UI for filter management (future)

### Phase 5: Predictive Modeling (Future - Week 5+)
**Goals:**
- Train models on patterns for prediction
- Predict email importance, urgency, response time
- Suggest filters proactively

**Tasks:**
1. Export pattern data for ML training
2. Build importance prediction model
3. Build response urgency prediction model
4. Add prediction scores to memory entries
5. Surface predictions in UI

---

## Estimated Costs

**30 days of email import (assumptions: 100 emails/day = 3,000 total):**

| Operation | Cost per Email | Total Cost |
|-----------|----------------|------------|
| Entity extraction | $0.000002 | $0.006 |
| Spam classification | $0.000003 | $0.009 |
| **Total** | **$0.000005** | **$0.015** |

**Annual cost estimate:** ~$0.18/year for 3,000 emails/month

---

## Next Steps (Prioritized)

1. **IMMEDIATE:** Add spam exclusion to Gmail query (15 min, zero cost)
2. **WEEK 1:** Implement AI spam classifier (~$0.009 for 30 days)
3. **WEEK 2:** Add action items extraction (no additional cost)
4. **WEEK 3:** Build pattern storage schema + analyzer
5. **WEEK 4:** Implement custom filtering engine

---

## Technical Notes

**Database changes required:**
- Add `emailPatterns` table
- Add `emailFilters` table
- Add spam score to `memoryEntries.metadata`

**New dependencies:**
- None (uses existing Mistral AI via OpenRouter)

**Breaking changes:**
- None (all additive features)

**Performance considerations:**
- Pattern analysis should run async (post-ingestion)
- Filter matching should be optimized with indexes
- Large batch imports may need rate limiting adjustments
