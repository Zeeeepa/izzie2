# Self-Awareness Context Flow

## Request Flow with Self-Awareness

```
User sends message to /api/chat
        ↓
[Authentication]
        ↓
[Get or Create Session]
        ↓
[Retrieve Context from Weaviate]
   - Entities (people, companies, projects)
   - Memories (facts, preferences, events)
        ↓
[Get Self-Awareness Context] ← NEW
   - Identity (name, version, description)
   - Architecture (context window, memory, entities, sessions)
   - Connectors (Gmail, Calendar, Drive, Weaviate)
   - Capabilities (what Izzie can do)
        ↓
[Build System Prompt]
   1. Base identity: "You are Izzie, {userName}'s assistant..."
   2. Self-awareness context ← NEW
   3. Response format instructions
   4. Behavioral instructions
        ↓
[Build Message Context]
   - System prompt (with self-awareness)
   - Entity context
   - Compressed history
   - Recent messages
   - Current message
        ↓
[Stream AI Response]
        ↓
[Update Session & Task Tracking]
        ↓
Response to user
```

## System Prompt Structure

```
┌─────────────────────────────────────────────┐
│ System Prompt                               │
├─────────────────────────────────────────────┤
│ 1. Base Identity                            │
│    "You are Izzie, {userName}'s assistant"  │
│                                             │
│ 2. Self-Awareness Context ← NEW             │
│    ┌────────────────────────────────────┐   │
│    │ ## About Me (Izzie)                │   │
│    │                                    │   │
│    │ ### My Architecture                │   │
│    │ - Context Window: ...              │   │
│    │ - Memory System: ...               │   │
│    │ - Entity System: ...               │   │
│    │ - Session Management: ...          │   │
│    │                                    │   │
│    │ ### Connected Data Sources         │   │
│    │ - Gmail: ...                       │   │
│    │ - Google Calendar: ...             │   │
│    │ - Google Drive: ...                │   │
│    │ - Weaviate: ...                    │   │
│    │                                    │   │
│    │ ### What I Can Do                  │   │
│    │ - Remember facts...                │   │
│    │ - Track people...                  │   │
│    │ - Maintain context...              │   │
│    │ ...                                │   │
│    └────────────────────────────────────┘   │
│                                             │
│ 3. Response Format Instructions             │
│    JSON structure for responses             │
│                                             │
│ 4. Behavioral Instructions                  │
│    - Address user by name                   │
│    - Use context naturally                  │
│    - Explain self accurately ← NEW          │
│    - Track current task                     │
│    - Be conversational                      │
└─────────────────────────────────────────────┘
```

## Example User Queries

### Before Self-Awareness
**User:** "What can you do?"
**Izzie:** "I can help you with various tasks, answer questions, and assist with your work."
*Generic, vague response*

### After Self-Awareness
**User:** "What can you do?"
**Izzie:** "I have access to your Gmail, Google Calendar, and Google Drive. I can:
- Remember facts, preferences, and context from your emails and documents
- Track people, companies, and projects you interact with
- Maintain conversation context across long sessions
- Track your current task and help you stay focused
- Search semantically across all your connected data

My memory system uses temporal decay, so frequently accessed information stays more relevant. I also extract entities like people, companies, and projects from your emails to help me understand your context better."

*Specific, accurate, informative*

## Token Cost Analysis

### Per-Request Cost
- Self-awareness context: ~380-400 tokens
- Added to every chat request
- Total system prompt: ~600-800 tokens (was ~200-400)

### Trade-offs
**Pros:**
- Accurate self-explanation
- Better user understanding
- Discovery of capabilities
- Transparency about data sources

**Cons:**
- +400 tokens per request (~$0.0001 extra per request with GPT-4)
- Slightly longer context window usage

**Verdict:** Worth the cost for significantly improved user experience and transparency.

## Future Optimizations

1. **Lazy Loading**: Only include self-awareness when user asks meta-questions
2. **Caching**: Cache self-awareness context per user (it's mostly static)
3. **Dynamic Context**: Only include relevant sections based on query
4. **Compression**: Shorten descriptions while maintaining accuracy
