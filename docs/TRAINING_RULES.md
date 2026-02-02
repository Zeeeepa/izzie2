# Training & Discovery Business Rules

This document defines the critical business rules for Izzie's training and discovery system. These rules govern how data is collected, processed, and used for entity extraction and relationship inference.

---

## 1. Data Sources

### SENT Emails Only (Critical Rule)

The discovery system **exclusively** processes the user's **SENT emails** using the Gmail query `in:sent`.

```
Query: in:sent after:YYYY-MM-DD before:YYYY-MM-DD
```

**Rationale:**
- Training on user's own content ensures high-quality, relevant data
- Sent emails reflect the user's actual relationships and priorities
- Avoids processing random received mail, spam, or marketing content
- User has full ownership and context over sent content

**Never process:**
- Inbox emails (received mail)
- Spam folder
- Promotional emails
- Trash folder

### Calendar Events

The system also processes the user's **calendar events** as a secondary data source.

**What gets processed:**
- Events the user created or is attending
- Meeting titles, descriptions, and attendee lists
- Event locations and times

---

## 2. Entity Types Extracted

The following entity types are extracted from emails and calendar events:

| Type | Description | Example |
|------|-------------|---------|
| `person` | Individual people mentioned or involved | "John Smith", "Dr. Sarah Chen" |
| `company` | Organizations, businesses, companies | "Acme Corp", "Google", "MIT" |
| `project` | Project names, initiatives, products | "Project Alpha", "Q4 Launch", "Mobile App v2" |
| `topic` | Subject areas, themes, domains | "Machine Learning", "Budget Planning" |
| `location` | Geographic places (prefer cities over countries) | "San Francisco", "Hastings on Hudson NY" |
| `tool` | Software, platforms, APIs, services | "Slack", "GitHub", "HiBob", "Zoom" |
| `action_item` | Tasks, todos, follow-ups | "Send proposal by Friday", "Schedule review meeting" |

### Entity Properties

Each extracted entity includes:

```typescript
interface Entity {
  type: EntityType;
  value: string;           // Raw extracted value
  normalized: string;      // Normalized form (e.g., "Bob" -> "Robert Smith")
  confidence: number;      // 0-100% confidence score
  source: 'metadata' | 'body' | 'subject';  // Where found
  context?: string;        // Surrounding text for context

  // Action item specific:
  assignee?: string;       // Who should do it
  deadline?: string;       // When it's due
  priority?: 'low' | 'medium' | 'high';
}
```

---

## 3. Relationship Types

Relationships connect entities and are extracted inline during entity discovery.

### Professional Relationships

| Type | Direction | Description |
|------|-----------|-------------|
| `WORKS_WITH` | Person <-> Person | Colleagues, collaborators |
| `REPORTS_TO` | Person -> Person | Reporting hierarchy |
| `WORKS_FOR` | Person -> Company | Employment relationship |
| `LEADS` | Person -> Project | Leadership role |
| `WORKS_ON` | Person -> Project | Project involvement |
| `EXPERT_IN` | Person -> Topic | Domain expertise |

### Business Relationships

| Type | Direction | Description |
|------|-----------|-------------|
| `PARTNERS_WITH` | Company <-> Company | Business partnership |
| `COMPETES_WITH` | Company <-> Company | Market competition |
| `OWNS` | Company -> Project | Ownership/sponsorship |

### Personal Relationships

| Type | Direction | Description |
|------|-----------|-------------|
| `FRIEND_OF` | Person <-> Person | Personal friendship |
| `FAMILY_OF` | Person <-> Person | General family relation |
| `MARRIED_TO` | Person <-> Person | Spousal relationship |
| `SIBLING_OF` | Person <-> Person | Brother/sister |

### Structural Relationships

| Type | Direction | Description |
|------|-----------|-------------|
| `RELATED_TO` | Project <-> Project | General relation |
| `DEPENDS_ON` | Project -> Project | Dependency |
| `PART_OF` | Project -> Project | Parent-child hierarchy |
| `LOCATED_IN` | Person/Company -> Location | Geographic location |
| `SUBTOPIC_OF` | Topic -> Topic | Topic hierarchy |
| `ASSOCIATED_WITH` | Topic <-> Topic | Topic association |

### Relationship Properties

```typescript
interface InlineRelationship {
  fromType: EntityType;
  fromValue: string;
  toType: EntityType;
  toValue: string;
  relationshipType: RelationshipType;
  confidence: number;      // 0-1 confidence score
  evidence: string;        // Quote/context supporting this relationship
}
```

---

## 4. Budget System

The system uses **separate budgets** for discovery and training operations.

### Discovery Budget

Used for processing emails and calendar events:

```typescript
// Cost estimates (in cents)
COST_PER_EMAIL_EXTRACTION = 0.05   // ~$0.0005 per email
COST_PER_CALENDAR_EXTRACTION = 0.03  // Slightly cheaper
```

**Budget exhaustion behavior:**
- Session status changes to `budget_exhausted`
- Processing stops immediately
- User can add more budget to resume

### Training Budget

Used for human feedback collection and model training:

```typescript
COST_PER_SAMPLE = 0.1  // ~$0.001 per sample
```

**Default allocations:**
- Discovery budget: User-specified
- Training budget: Default $5 (500 cents)

### Budget Tracking

```typescript
interface BudgetInfo {
  total: number;      // Total budget in cents
  used: number;       // Amount consumed
  remaining: number;  // Available for operations
}
```

---

## 5. Day Tracking

The system tracks processed days to avoid redundant processing.

### How It Works

1. Processing iterates day-by-day, going backwards from today
2. Each (userId, sourceType, date) combination is tracked
3. **Never reprocesses the same day** for the same source

### Progress Table

```typescript
interface TrainingProgressEntry {
  id: string;
  userId: string;
  sessionId?: string;
  sourceType: 'email' | 'calendar';
  processedDate: string;  // YYYY-MM-DD format
  itemsFound: number;
  processedAt: Date;
}
```

### Check Before Processing

```typescript
// Before processing any day:
const alreadyProcessed = await isDateProcessed(userId, 'email', '2026-01-15');
if (alreadyProcessed) {
  // Skip this day
}
```

---

## 6. Feedback Flow

Human feedback is collected through a structured process.

### Local Marking (No Immediate API Call)

1. User reviews a sample (entity or relationship)
2. Marks as "correct" or "incorrect" with optional correction
3. Feedback is stored locally in the browser/UI
4. **No API call is made until batch submission**

### Batch Submission

1. User clicks "Submit All" button
2. All marked feedback is sent to the server in one batch
3. Session statistics are updated
4. Accuracy metrics are recalculated

### Feedback Data Structure

```typescript
interface FeedbackSubmission {
  sampleId: string;
  isCorrect: boolean;
  correctedLabel?: string;  // If user provides correction
  notes?: string;           // Optional explanation
}
```

### Auto-Train Threshold

**50 feedback items required before Auto-Train unlocks.**

```typescript
const MIN_FEEDBACK_FOR_AUTO_TRAIN = 50;

// Auto-train triggers when:
// session.mode === 'auto_train' &&
// session.progress.feedbackReceived >= session.config.autoTrainThreshold
```

This threshold ensures sufficient data quality before automated model updates.

---

## 7. Action Items to Google Tasks

Action item entities are automatically synced to Google Tasks.

### Task List

- Created in a dedicated list: **"Izzie Discovered"**
- List is created automatically if it doesn't exist
- Tasks include metadata from discovery

### Duplicate Detection

- Duplicates are detected **by title** (case-insensitive)
- Existing tasks with the same title are skipped
- Local cache prevents redundant API calls

### Task Notes

Each synced task includes:
- Original context from the email
- Occurrence count (how many times mentioned)
- First/last seen dates
- "Discovered via Izzie email analysis" footer

### Sync Flow

```
1. Entity extracted as action_item
2. AutoTaskSyncService checks local cache
3. If not duplicate, creates task via Google Tasks API
4. Task appears in "Izzie Discovered" list
5. Title added to local cache to prevent future duplicates
```

---

## Session Statuses

| Status | Description |
|--------|-------------|
| `collecting` | Actively collecting samples for feedback |
| `running` | Autonomous processing in progress |
| `paused` | Processing paused by user or error |
| `training` | Model training in progress |
| `complete` | Session finished successfully |
| `budget_exhausted` | Budget depleted, needs refill |

---

## Related Documentation

- [Entity Extraction Implementation](implementation/entity-extraction-implementation-summary.md)
- [Gmail Integration](gmail-integration.md)
- [Google Tasks Implementation](implementation/GOOGLE_TASKS_IMPLEMENTATION.md)
