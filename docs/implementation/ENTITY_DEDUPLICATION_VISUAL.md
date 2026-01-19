# Entity Dashboard - Before and After Deduplication

## Before Deduplication

```
┌─────────────────────────────────────────────────────┐
│ Robert (Masa) Matsuoka              [PERSON]       │
│ Normalized: robert_matsuoka                         │
│ Confidence: ███████████░░ 95%                       │
│ From: email-1@example.com                           │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Robert Matsuoka                     [PERSON]       │
│ Normalized: robert_matsuoka                         │
│ Confidence: ██████████░░░ 92%                       │
│ From: email-2@example.com                           │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Robert (Masa) Matsuoka              [PERSON]       │
│ Normalized: robert_matsuoka                         │
│ Confidence: ███████████░░ 95%                       │
│ From: email-3@example.com                           │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Robert M.                           [PERSON]       │
│ Normalized: robert_matsuoka                         │
│ Confidence: █████████░░░░ 85%                       │
│ From: email-4@example.com                           │
└─────────────────────────────────────────────────────┘

... and so on (10+ duplicate entries)
```

**Issues:**
- Cluttered dashboard with duplicates
- User has to mentally deduplicate
- Difficult to see unique entities
- Wastes screen real estate

---

## After Deduplication

```
┌─────────────────────────────────────────────────────┐
│ Robert (Masa) Matsuoka       [10x]  [PERSON]       │
│ Normalized: robert_matsuoka                         │
│ Confidence: ███████████░░ 95%                       │
│ From: email-3@example.com (most recent)            │
│                                                      │
│ 💡 This entity appears in 10 emails                │
└─────────────────────────────────────────────────────┘

... other unique entities ...
```

**Benefits:**
- ✅ Clean, uncluttered view
- ✅ Shows best version (longest name, highest confidence)
- ✅ Occurrences badge shows frequency
- ✅ Tooltip provides context
- ✅ Only unique entities displayed

---

## Entity Card Anatomy (After Deduplication)

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Robert (Masa) Matsuoka            [4x]    [PERSON]     │
│  └─ Entity name (longest version)   │         │         │
│                                      │         │         │
│                              Occurrences  Entity type    │
│                              badge (if > 1)              │
│                                                          │
│  Normalized: robert_matsuoka                            │
│  (only shown if different from value)                   │
│                                                          │
│  Confidence: ███████████░░ 95%     Source: Gmail        │
│                                                          │
│  Context: "...meeting with Robert..."                   │
│  (extracted context from email)                         │
│                                                          │
│  ──────────────────────────────────────────────────     │
│  From Email:                                             │
│  "Discussed Q4 roadmap and budget planning..."          │
│  ID: 1a2b3c4d... │ Jan 16, 2024                         │
│  (most recent email with this entity)                   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Deduplication Rules Summary

| Priority | Rule | Example |
|----------|------|---------|
| 1st | **Highest Confidence** | 0.95 beats 0.92 |
| 2nd | **Longest Value** | "Robert (Masa) Matsuoka" beats "Robert M." |
| 3rd | **Most Recent** | 2024-01-16 beats 2024-01-15 |

**Key**: `type:normalized` (case-insensitive)
- `person:robert_matsuoka`
- `company:acme_corp`
- `project:website_redesign`

---

## Stats Summary Impact

### Before
```
People: 50 entities (but 20 are duplicates)
```

### After
```
People: 30 entities (deduplicated)
  └─ But total occurrences: 50 across all emails
```

The stats still show the **raw count** from Weaviate (before deduplication), while the entity list shows **unique deduplicated** entities. This gives users both views:
- Total extractions (stats)
- Unique entities (entity cards)

---

## User Benefits

1. **Clearer Overview**: See all unique entities at a glance
2. **Better Context**: Occurrences badge shows importance/frequency
3. **Quality Signals**: Always shows the best version (highest confidence, most details)
4. **Less Scrolling**: Dashboard is more compact and useful
5. **Faster Scanning**: No mental deduplication needed

---

## Technical Implementation

- **Server-Side Deduplication**: Happens in API route before sending to client
- **Zero Client Impact**: No changes needed to existing dashboard logic
- **Backward Compatible**: Works with existing entity data structure
- **Performant**: Map-based O(n) deduplication, minimal overhead

---

## Next Steps (Optional Enhancements)

1. **Click to Expand**: Show all occurrences in a modal
2. **Source Emails List**: Link to all emails containing this entity
3. **Confidence History**: Show confidence scores across all occurrences
4. **Entity Merging UI**: Manual merge/split for edge cases
5. **Analytics**: Track which entities appear most frequently
