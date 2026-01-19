# Memory Extraction System

A comprehensive memory extraction and management system with temporal decay for personalized AI context.

## Overview

The Memory System captures facts, preferences, events, and context from emails and other sources. Unlike entity extraction (which identifies named things like people, companies, projects), memories capture the contextual information that's important for personalization.

### Key Concepts

**Entities vs Memories:**
- **Entities**: Named things (Person, Company, Project, Date, Topic, Location, ActionItem)
- **Memories**: Facts, preferences, events, context
- **Relationship**: All entities ARE memories, but not all memories are entities

**Examples:**

```
Entity: "Sarah Smith" (Person)
Memory: "Sarah prefers morning meetings" (Preference)

Entity: "Q4 Planning" (Project)
Memory: "Team decided to use PostgreSQL instead of MongoDB" (Decision)

Entity: "John Doe" (Person)
Memory: "John's birthday is March 15th" (Fact)
```

## Architecture

### Components

1. **Types** (`src/lib/memory/types.ts`)
   - Core memory interfaces and types
   - Memory categories and sources
   - Decay rate constants

2. **Extraction** (`src/lib/memory/extraction.ts`)
   - AI-powered memory extraction from emails
   - Batch extraction support
   - Cost tracking

3. **Storage** (`src/lib/memory/storage.ts`)
   - Weaviate storage with semantic search
   - Memory CRUD operations
   - Statistics and analytics

4. **Retrieval** (`src/lib/memory/retrieval.ts`)
   - Decay-weighted search
   - Category and tag filtering
   - Recent memory access

5. **Decay** (`src/lib/memory/decay.ts`)
   - Temporal decay calculations
   - Memory strength computation
   - Half-life predictions

### Data Flow

```
Email/Text → Extraction → Storage → Retrieval → Application
                ↓            ↓          ↓
              AI Model   Weaviate   Decay Filter
```

## Memory Categories

### 1. Preference (Decay: 0.01/day)
User likes/dislikes, habits, work preferences.

**Examples:**
- "User prefers async communication over meetings"
- "John doesn't like coffee"
- "Team uses Slack for communication"

### 2. Fact (Decay: 0.02/day)
Objective, stable information.

**Examples:**
- "Sarah works in marketing"
- "Q4 report is due December 31"
- "Project uses TypeScript and React"

### 3. Event (Decay: 0.05/day)
Things that happened or will happen.

**Examples:**
- "Team meeting scheduled for Friday at 2pm"
- "Launch party was successful"
- "Going on vacation next week"

### 4. Decision (Decay: 0.03/day)
Decisions that were made.

**Examples:**
- "Decided to use PostgreSQL instead of MongoDB"
- "Team chose to postpone the release"
- "Approved budget increase for marketing"

### 5. Sentiment (Decay: 0.1/day)
Emotional context, feelings (fast decay).

**Examples:**
- "User is frustrated with slow deployment"
- "Client is happy with the results"
- "Team is excited about new feature"

### 6. Reminder (Decay: 0.2/day)
Time-sensitive reminders (very fast decay).

**Examples:**
- "Need to follow up on proposal"
- "Remember to book flight for conference"
- "Check with legal before signing"

### 7. Relationship (Decay: 0.02/day)
How entities relate to each other.

**Examples:**
- "Sarah reports to Michael"
- "Client XYZ is considering competitor"
- "John collaborates with the design team"

## Temporal Decay

Memories fade over time unless accessed. The decay system ensures recent and important memories are prioritized.

### Decay Formula

```typescript
strength = exp(-effectiveDecayRate * daysSinceAccess)
effectiveDecayRate = decayRate * (1 - importance * 0.5)
```

### Key Properties

- **Strength**: 0-1 value representing current relevance
- **Importance**: User-defined importance (0-1)
- **Decay Rate**: Category-specific decay speed
- **Last Accessed**: Accessing a memory refreshes it

### Decay Rates

| Category | Rate/Day | Half-Life (importance=0.5) |
|----------|----------|----------------------------|
| Preference | 0.01 | 92 days |
| Fact | 0.02 | 46 days |
| Relationship | 0.02 | 46 days |
| Decision | 0.03 | 31 days |
| Event | 0.05 | 18 days |
| Sentiment | 0.1 | 9 days |
| Reminder | 0.2 | 5 days |

### Half-Life Example

For a memory with importance=0.8:
- Effective decay rate = 0.02 * (1 - 0.8 * 0.5) = 0.012
- Half-life = ln(2) / 0.012 ≈ 58 days

## Usage

### 1. Extract Memories from Email

```typescript
import { extractMemoriesFromEmail } from '@/lib/memory';

const result = await extractMemoriesFromEmail(email, userIdentity);

console.log(`Extracted ${result.memories.length} memories`);
console.log(`Cost: $${result.cost.toFixed(6)}`);
```

### 2. Save Memories to Weaviate

```typescript
import { saveMemories } from '@/lib/memory';
import type { CreateMemoryInput } from '@/lib/memory';

const inputs: CreateMemoryInput[] = result.memories.map(m => ({
  userId: 'user-123',
  content: m.content,
  category: m.category,
  sourceType: 'email',
  sourceId: email.id,
  sourceDate: email.date,
  importance: m.importance,
  confidence: m.confidence,
  relatedEntities: m.relatedEntities,
  tags: m.tags,
  expiresAt: m.expiresAt,
}));

await saveMemories(inputs);
```

### 3. Search Memories (Decay-Weighted)

```typescript
import { searchMemories } from '@/lib/memory';

const memories = await searchMemories({
  query: 'meeting preferences',
  userId: 'user-123',
  minStrength: 0.5,      // Filter by decay strength
  minConfidence: 0.7,    // Filter by extraction confidence
  categories: ['preference', 'fact'],
  limit: 10,
});

memories.forEach(memory => {
  console.log(`${memory.content} (strength: ${memory.strength.toFixed(2)})`);
});
```

### 4. Get Recent Memories

```typescript
import { getRecentMemories } from '@/lib/memory';

const memories = await getRecentMemories('user-123', {
  limit: 20,
  categories: ['event', 'reminder'],
  minStrength: 0.3,
});
```

### 5. Calculate Memory Strength

```typescript
import { calculateMemoryStrength, calculateHalfLife } from '@/lib/memory';

const strength = calculateMemoryStrength(memory);
const halfLife = calculateHalfLife(memory);

console.log(`Current strength: ${strength.toFixed(2)}`);
console.log(`Half-life: ${halfLife.toFixed(1)} days`);
```

### 6. Refresh Memory Access

```typescript
import { refreshMemoryAccess } from '@/lib/memory';

// Accessing a memory resets its decay clock
await refreshMemoryAccess(memoryId);
```

## Integration with Gmail Extraction

The memory system is integrated into the Gmail entity extraction pipeline:

```bash
# Extract memories alongside entities
npx tsx scripts/extract-gmail-entities.ts --extract-memories

# With specific user and limit
npx tsx scripts/extract-gmail-entities.ts \
  --user user@example.com \
  --limit 50 \
  --extract-memories
```

## Testing

Run the test script to verify the memory system:

```bash
npx tsx scripts/test-memory-extraction.ts
```

The test script:
1. Initializes the Memory schema in Weaviate
2. Extracts memories from sample emails
3. Stores memories in Weaviate
4. Tests search and retrieval
5. Verifies temporal decay calculations
6. Displays statistics

## Weaviate Schema

The Memory collection includes:

```typescript
{
  userId: string;           // Owner
  content: string;          // Memory content
  category: string;         // Memory category
  sourceType: string;       // email, calendar, chat, manual
  sourceId: string;         // Source identifier
  sourceDate: string;       // ISO date
  importance: number;       // 0-1
  decayRate: number;        // Category-specific
  lastAccessed: string;     // ISO date
  expiresAt: string | null; // Optional expiration
  confidence: number;       // Extraction confidence
  relatedEntities: string;  // JSON array
  tags: string;             // JSON array
  createdAt: string;        // ISO date
  updatedAt: string;        // ISO date
  isDeleted: boolean;       // Soft delete
}
```

## Performance

### Extraction Cost

- Model: Claude 3.5 Sonnet (via OpenRouter)
- Average: $0.001-0.005 per email
- Typical: 3-10 memories per email

### Storage

- Weaviate with BM25 keyword search
- No vectorization required for search
- Efficient batch operations

### Retrieval

- Decay calculations on-the-fly
- Automatic refresh of accessed memories (top 5)
- Filtered by strength and confidence

## Best Practices

### 1. Set Appropriate Importance

```typescript
// High importance for user preferences
const inputs = [{
  content: "User prefers morning meetings",
  category: "preference",
  importance: 0.9,  // High importance → slow decay
}];

// Low importance for transient sentiments
const inputs = [{
  content: "User seemed frustrated today",
  category: "sentiment",
  importance: 0.3,  // Low importance → fast decay
}];
```

### 2. Use Expiration for Time-Sensitive Memories

```typescript
const inputs = [{
  content: "Q4 planning meeting on Tuesday",
  category: "event",
  expiresAt: new Date('2026-01-21T10:00:00Z'),  // Hard expiration
}];
```

### 3. Filter by Strength

```typescript
// Only retrieve memories with strength ≥ 0.5
const memories = await searchMemories({
  query: 'project decisions',
  userId: 'user-123',
  minStrength: 0.5,  // Exclude severely decayed memories
});
```

### 4. Periodic Cleanup

```typescript
// Get decay statistics
const stats = await getDecayStats(memories);

// Delete weak memories (optional)
for (const memory of memories) {
  if (memory.strength < 0.1) {
    await deleteMemory(memory.id);
  }
}
```

## Future Enhancements

1. **Automatic Importance Inference**: Use AI to set importance based on context
2. **Memory Consolidation**: Merge similar memories over time
3. **Cross-Source Correlation**: Link memories from emails, calendar, chat
4. **Personalized Decay Rates**: Adjust decay based on user behavior
5. **Memory Reinforcement**: Strengthen memories when related content is seen
6. **Semantic Clustering**: Group related memories for better organization

## See Also

- [Entity Extraction](./entity-extraction.md)
- [Weaviate Integration](./weaviate-integration.md)
- [Temporal Decay Algorithm](../src/lib/memory/decay.ts)
