# Chat UI JSON Response Display Fix

**Date**: 2026-01-18
**Issue**: Chat UI was displaying full JSON response instead of just the message text
**Status**: ✅ Fixed

## Problem

The chat UI was showing raw JSON like:
```json
{"response": "Hello! How can I help you?", "currentTask": null}
```

Instead of just:
```
Hello! How can I help you?
```

## Root Cause

The API streams responses with a `content` field that contains the full LLM output. When the LLM follows the structured response format (as instructed), the `content` is a JSON string with `response` and `currentTask` fields.

The UI was directly displaying `data.content` without parsing and extracting the `response` field.

**API Response Structure** (`/api/chat/route.ts`, lines 128-137):
```typescript
const data = JSON.stringify({
  delta: chunk.delta,
  content: chunk.content,  // ← This is the full LLM output (may be JSON)
  done: chunk.done,
  sessionId: chatSession.id,
  context: {
    entities: context.entities.slice(0, 5),
    memories: context.memories.slice(0, 5),
  },
});
```

When the LLM follows instructions, `chunk.content` is a JSON string:
```json
{"response": "Hello!", "currentTask": null}
```

## Solution

Updated `/app/dashboard/chat/page.tsx` (lines 133-158) to:

1. **Try to parse `data.content` as JSON**
2. **Extract the `response` field** if parsing succeeds
3. **Fall back to raw content** if not JSON

```typescript
// Update assistant message
setMessages((prev) =>
  prev.map((m) => {
    if (m.id !== assistantMessageId) return m;

    // Extract response text from potentially JSON-formatted content
    let responseText = m.content;

    if (data.content) {
      // Try to parse as JSON first (structured response)
      try {
        const parsed = JSON.parse(data.content);
        responseText = parsed.response || data.content;
      } catch {
        // Not JSON, use content directly
        responseText = data.content;
      }
    }

    return {
      ...m,
      content: responseText,
      entities: data.context?.entities || data.entities || m.entities,
    };
  })
);
```

## Implementation Details

**Handles both cases**:
- ✅ **Structured response** (JSON): `{"response": "text", "currentTask": {...}}`
  - Parses JSON and extracts `parsed.response`
- ✅ **Plain text response**: If LLM doesn't follow format
  - Falls back to `data.content` directly

**Error handling**:
- Try-catch ensures parse errors don't break the UI
- Gracefully degrades to raw content if JSON parsing fails

## Testing

To verify the fix:

1. **Start the dev server**:
   ```bash
   npm run dev
   ```

2. **Navigate to chat**: http://localhost:3000/dashboard/chat

3. **Send a test message**: "Hello!"

4. **Expected result**: Should see clean response text, not JSON

5. **Check browser console**: Should see no JSON parsing errors

## Files Changed

- `/src/app/dashboard/chat/page.tsx` - Fixed response parsing (lines 133-158)

## Related Code

- `/src/app/api/chat/route.ts` - API that streams the response (lines 142-159)
- `/src/lib/chat/session.ts` - Session manager that defines `StructuredLLMResponse` format

## LOC Delta

- **Added**: 12 lines (JSON parsing logic + comments)
- **Removed**: 9 lines (old direct assignment)
- **Net Change**: +3 lines

## Verification Checklist

- [x] Handles structured JSON responses
- [x] Handles plain text responses
- [x] Graceful error handling for malformed JSON
- [x] Preserves entity context display
- [x] No breaking changes to message flow
- [x] Type safety maintained
