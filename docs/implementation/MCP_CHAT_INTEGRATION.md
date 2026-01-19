# MCP Chat Integration Summary

## Overview

Successfully integrated Model Context Protocol (MCP) tools into the chat API, enabling Claude to use tools from connected MCP servers during conversations.

## Changes Made

### 1. Type Definitions (`/src/types/index.ts`)

Extended core types to support tool calling:

- **ChatMessage**: Added `tool`, `tool_calls`, `tool_call_id`, and `name` fields
- **ToolCall**: New interface for representing tool calls
- **Tool**: New interface for tool definitions in OpenAI format
- **ChatOptions**: Added `tools` and `tool_choice` parameters
- **ChatResponse**: Added `tool_calls` field

### 2. AI Client (`/src/lib/ai/client.ts`)

Updated OpenRouterClient to support tools:

- Modified `chat()` method to pass `tools` and `tool_choice` to API
- Modified `streamChat()` method to include tool parameters
- Updated message mapping to include tool-related fields
- Added `tool_calls` to response object

### 3. Chat API Route (`/src/app/api/chat/route.ts`)

Implemented full MCP tool integration:

#### Helper Functions

- **`convertMCPToolsToOpenAI(mcpTools)`**: Converts MCP tool format to OpenAI function calling format
  - Namespaces tools as `{serverId}__{toolName}` to prevent conflicts
  - Maps MCP tool schemas to OpenAI parameters format

- **`executeMCPTool(toolName, args)`**: Executes tools on MCP servers
  - Parses serverId and toolName from namespaced format
  - Calls `MCPClientManager.executeTool()`
  - Returns structured result with success/error handling

#### Main Integration

1. **Tool Discovery**: Gets available MCP tools from all connected servers
2. **Tool Execution Loop**: Implements iterative tool calling
   - Uses non-streaming API when tools are available (to detect tool calls)
   - Executes requested tools via MCP client manager
   - Adds tool results to conversation context
   - Continues loop until final response (max 5 iterations)
3. **Client Notifications**: Sends real-time updates during tool execution
   - `tool_execution`: When a tool starts executing
   - `tool_result`: When a tool completes

## Architecture

```
User Message
    ↓
Chat API
    ↓
Get MCP Tools ← MCPClientManager
    ↓
AI Model (with tools)
    ↓
Tool Call? ──→ Execute MCP Tool ──→ Add Result to Context ──┐
    ↓ No                                                     ↓
Final Response ←──────────────────────────────────────────────┘
    ↓
Stream to Client
```

## Tool Execution Flow

1. **Discovery Phase**
   - MCPClientManager maintains connections to MCP servers
   - Each server exposes tools via `listTools()`
   - Tools are converted to OpenAI format with namespace prefixing

2. **Conversation Phase**
   - AI model receives tools in function calling format
   - When model wants to use a tool, it returns `tool_calls` instead of final response

3. **Execution Phase**
   - Parse tool name to extract serverId and toolName
   - Execute tool via `MCPClientManager.executeTool(serverId, toolName, args)`
   - Add tool result as `role: "tool"` message in conversation

4. **Iteration Phase**
   - Send updated context (including tool results) back to AI
   - Model processes results and either:
     - Calls more tools (repeat execution phase)
     - Returns final response to user

5. **Streaming Phase**
   - When tools are not available or no tool calls, stream response directly
   - Send SSE chunks to client for real-time display

## MCP Client Manager

Located at `/src/lib/mcp/`:

- **`getMCPClientManager()`**: Singleton access to client manager
- **`connect(config)`**: Connect to an MCP server (stdio or SSE transport)
- **`executeTool(serverId, toolName, args)`**: Execute a tool on a specific server
- **`getAllTools()`**: Get all available tools from all connected servers
- **`getAllStatuses()`**: Get connection status of all servers

## Tool Name Format

Tools are namespaced to prevent conflicts:

```typescript
// MCP Tool: { name: "search", serverId: "web-browser" }
// OpenAI Format: "web-browser__search"

// On execution:
const [serverId, toolName] = "web-browser__search".split("__");
// serverId = "web-browser"
// toolName = "search"
```

## Streaming Behavior

- **With Tools Available**: Uses non-streaming API to detect tool calls
- **Without Tools**: Uses streaming API for real-time response
- **After Tool Execution**: Final response uses non-streaming (already has complete content)

## Client-Side Integration

The frontend should handle:

1. **Tool Execution Events** (`type: "tool_execution"`):
   ```json
   {
     "type": "tool_execution",
     "tool": "web-browser__search",
     "status": "executing"
   }
   ```

2. **Tool Result Events** (`type: "tool_result"`):
   ```json
   {
     "type": "tool_result",
     "tool": "web-browser__search",
     "success": true
   }
   ```

3. **Standard Chat Events** (unchanged):
   ```json
   {
     "delta": "chunk",
     "content": "full content so far",
     "done": false,
     "sessionId": "...",
     "context": { ... }
   }
   ```

## Testing

To test the integration:

1. **Connect an MCP Server**:
   ```typescript
   const manager = getMCPClientManager();
   await manager.connect({
     id: 'test-server',
     name: 'Test Server',
     transport: 'stdio',
     command: 'npx',
     args: ['-y', '@modelcontextprotocol/server-example'],
     enabled: true,
   });
   ```

2. **Verify Tools Available**:
   ```typescript
   const tools = manager.getAllTools();
   console.log(`${tools.length} tools available`);
   ```

3. **Send Chat Message**:
   - Message should include request that would trigger tool use
   - Check logs for tool execution
   - Verify tool results in conversation context

## Limitations

- **Max Iterations**: Tool execution loop limited to 5 iterations to prevent infinite loops
- **Error Handling**: Tool execution errors are returned as results but don't halt conversation
- **Streaming**: Tool calls require non-streaming mode, so first response may have slight delay
- **No Parallel Tools**: Tools are executed sequentially, not in parallel

## Future Enhancements

1. **Parallel Tool Execution**: Execute multiple tool calls concurrently
2. **Tool Permissions**: Add user approval flow for sensitive tools
3. **Tool Audit Log**: Track all tool executions in database
4. **Caching**: Cache tool results for identical calls
5. **Streaming Tool Results**: Stream tool execution progress
6. **Tool Usage Analytics**: Track which tools are most useful

## Files Modified

- `/src/types/index.ts` - Added tool calling types
- `/src/lib/ai/client.ts` - Updated to support tools
- `/src/app/api/chat/route.ts` - Implemented MCP integration

## Dependencies

- `@modelcontextprotocol/sdk` - MCP SDK for client connections
- Existing: `openai`, `next`, `@/lib/mcp/*`

## Next Steps

1. Test with actual MCP servers
2. Add UI indicators for tool execution
3. Implement tool permission system
4. Add tool execution audit logging
