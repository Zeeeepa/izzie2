# MCP Chat Integration - Developer Guide

## Quick Start

### 1. Connect an MCP Server

```typescript
import { getMCPClientManager } from '@/lib/mcp';

const mcpManager = getMCPClientManager();

// Connect to a server (example: filesystem server)
await mcpManager.connect({
  id: 'filesystem',
  userId: 'user-123',
  name: 'Filesystem',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

### 2. Chat with Tools Available

Once connected, tools are automatically available in chat conversations:

```typescript
// Send a message via /api/chat
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Can you list the files in /tmp?',
  }),
});

// The AI will automatically:
// 1. See filesystem tools are available
// 2. Decide to call filesystem__list_directory
// 3. Execute the tool via MCP
// 4. Format the response with results
```

## How It Works

### Architecture

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │
       │ "List files in /tmp"
       ▼
┌─────────────────────────────────────────────┐
│          Chat API (/api/chat)               │
│                                             │
│  1. Get MCP Tools                           │
│     ┌────────────────────────────┐          │
│     │ MCPClientManager           │          │
│     │ - filesystem__list         │          │
│     │ - filesystem__read         │          │
│     │ - time__get_current_time   │          │
│     └────────────────────────────┘          │
│                                             │
│  2. Send to AI with tools                   │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│           AI Model (Claude)                 │
│                                             │
│  Receives:                                  │
│  - User message                             │
│  - Conversation history                     │
│  - Available tools (function definitions)   │
│                                             │
│  Decides to call: filesystem__list_directory│
└─────────────┬───────────────────────────────┘
              │
              │ tool_calls: [...]
              ▼
┌─────────────────────────────────────────────┐
│          Chat API (Tool Execution)          │
│                                             │
│  3. Execute Tool                            │
│     ┌────────────────────────────┐          │
│     │ executeMCPTool()           │          │
│     │ - Parse serverId: filesystem│         │
│     │ - Parse toolName: list_dir │          │
│     │ - Execute via MCP          │          │
│     │ - Return results           │          │
│     └────────────────────────────┘          │
│                                             │
│  4. Add results to conversation             │
│     role: "tool"                            │
│     content: { files: [...] }               │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│           AI Model (Claude)                 │
│                                             │
│  Receives tool results, formats response:   │
│  "Here are the files in /tmp: ..."          │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│            User                             │
│  Receives formatted response with file list │
└─────────────────────────────────────────────┘
```

### Tool Execution Flow

1. **Tool Discovery**
   - MCP servers expose tools via `listTools()`
   - Tools are cached in `MCPClientManager`
   - Tools are namespaced: `{serverId}__{toolName}`

2. **Request Processing**
   ```typescript
   // User sends message
   POST /api/chat
   {
     "message": "List files in /tmp"
   }
   ```

3. **AI Receives Tools**
   ```typescript
   // Tools passed to AI in OpenAI format
   {
     type: "function",
     function: {
       name: "filesystem__list_directory",
       description: "List directory contents",
       parameters: {
         type: "object",
         properties: {
           path: { type: "string" }
         }
       }
     }
   }
   ```

4. **AI Requests Tool Execution**
   ```typescript
   // AI response with tool call
   {
     tool_calls: [{
       id: "call_abc123",
       type: "function",
       function: {
         name: "filesystem__list_directory",
         arguments: '{"path": "/tmp"}'
       }
     }]
   }
   ```

5. **Tool Execution**
   ```typescript
   // Chat API executes tool
   const [serverId, toolName] = "filesystem__list_directory".split("__");
   const result = await mcpManager.executeTool(
     "filesystem",
     "list_directory",
     { path: "/tmp" }
   );
   ```

6. **Results Back to AI**
   ```typescript
   // Add tool result to conversation
   {
     role: "tool",
     content: JSON.stringify(result),
     tool_call_id: "call_abc123",
     name: "filesystem__list_directory"
   }
   ```

7. **Final Response**
   ```typescript
   // AI formats final response
   {
     role: "assistant",
     content: "Here are the files in /tmp:\n- file1.txt\n- file2.log\n..."
   }
   ```

## Available MCP Servers

### Official Servers

1. **Filesystem** - File operations
   ```bash
   npx -y @modelcontextprotocol/server-filesystem /path/to/dir
   ```

2. **Time** - Date/time operations
   ```bash
   npx -y @modelcontextprotocol/server-time
   ```

3. **Echo** - Simple echo for testing
   ```bash
   npx -y @modelcontextprotocol/server-echo
   ```

4. **GitHub** - GitHub API access
   ```bash
   npx -y @modelcontextprotocol/server-github
   ```

5. **Google Drive** - Google Drive integration
   ```bash
   npx -y @modelcontextprotocol/server-gdrive
   ```

### Custom Servers

Create your own MCP server:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'custom-server',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

// Define tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'my_tool',
      description: 'Does something useful',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        },
      },
    },
  ],
}));

// Handle tool execution
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'my_tool') {
    return {
      content: [
        {
          type: 'text',
          text: `Result for: ${args.input}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Frontend Integration

### Handling Tool Events

```typescript
// Listen for SSE events
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;

    const data = JSON.parse(line.slice(6));

    switch (data.type) {
      case 'tool_execution':
        // Show "Executing {tool}..." indicator
        console.log(`Executing: ${data.tool}`);
        break;

      case 'tool_result':
        // Show result (success/failure)
        console.log(`Result: ${data.success ? '✓' : '✗'} ${data.tool}`);
        break;

      case 'metadata':
        // Session metadata
        console.log('Session:', data.sessionId);
        break;

      default:
        // Regular chat content
        if (data.delta) {
          updateChatMessage(data.content);
        }
    }
  }
}
```

### UI Components

See `examples/chat-with-mcp-ui.tsx` for a complete React component that:
- Shows tool execution in real-time
- Displays tool status (executing/completed/failed)
- Handles SSE streaming with tool events
- Provides example prompts for users

## Configuration

### Server Storage

MCP servers can be stored in the database for persistence:

```typescript
// Database schema (already exists)
table: mcp_servers
columns:
  - id (text, primary key)
  - user_id (text)
  - name (text)
  - description (text)
  - transport (text: 'stdio' | 'sse')
  - command (text, nullable)
  - args (jsonb, nullable)
  - url (text, nullable)
  - headers (jsonb, nullable)
  - enabled (boolean)
```

### Auto-Connect on Startup

```typescript
// In app initialization
async function initializeMCPServers(userId: string) {
  const db = getDb();
  const servers = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.userId, userId))
    .where(eq(mcpServers.enabled, true));

  const mcpManager = getMCPClientManager();

  for (const server of servers) {
    try {
      await mcpManager.connect(server);
      console.log(`✓ Connected to ${server.name}`);
    } catch (error) {
      console.error(`✗ Failed to connect to ${server.name}:`, error);
    }
  }
}
```

## Security Considerations

### Tool Permissions

Currently, all tools are available to the AI. Future enhancements should include:

1. **User Approval**: Require user confirmation for sensitive tools
2. **Tool Allowlist**: Configure which tools each user can access
3. **Audit Logging**: Track all tool executions (see `mcp_tool_audit_entries` table)

### Safe Defaults

```typescript
// Add permission checking before execution
async function executeMCPTool(
  userId: string,
  toolName: string,
  args: Record<string, unknown>
) {
  // Check if user has permission
  const hasPermission = await checkToolPermission(userId, toolName);
  if (!hasPermission) {
    throw new Error('Permission denied');
  }

  // Execute tool
  const result = await mcpManager.executeTool(serverId, actualToolName, args);

  // Log execution
  await logToolExecution({
    userId,
    toolName,
    arguments: args,
    result,
  });

  return result;
}
```

## Debugging

### Enable Debug Logging

```typescript
// In MCP client manager
const LOG_PREFIX = '[MCP Client]';
console.log(`${LOG_PREFIX} Executing tool ${toolName} on ${serverId}`);
```

### Check Tool Availability

```typescript
const mcpManager = getMCPClientManager();
const statuses = mcpManager.getAllStatuses();

statuses.forEach(status => {
  console.log(`Server: ${status.serverId}`);
  console.log(`Connected: ${status.connected}`);
  console.log(`Tools: ${status.tools.length}`);
  if (status.error) {
    console.error(`Error: ${status.error}`);
  }
});
```

### Test Tool Execution

```typescript
// Direct tool test
const result = await mcpManager.executeTool(
  'filesystem',
  'list_directory',
  { path: '/tmp' }
);
console.log('Result:', result);
```

## Limitations

1. **Max 5 Tool Iterations**: Prevents infinite loops
2. **Sequential Execution**: Tools run one at a time, not in parallel
3. **No Streaming for Tool Calls**: Tool execution uses non-streaming API
4. **Error Recovery**: Tool errors don't halt conversation, returned as results

## Troubleshooting

### Issue: Tools not available in chat

**Solution:**
```typescript
// 1. Check if server is connected
const status = mcpManager.getStatus('server-id');
console.log('Connected:', status?.connected);

// 2. Check tool list
const tools = mcpManager.getAllTools();
console.log('Available tools:', tools.map(t => t.name));

// 3. Verify connection
await mcpManager.connect(serverConfig);
```

### Issue: Tool execution fails

**Solution:**
```typescript
// 1. Test tool directly
try {
  const result = await mcpManager.executeTool('server-id', 'tool-name', args);
  console.log('Success:', result);
} catch (error) {
  console.error('Failed:', error);
}

// 2. Check server logs
// 3. Verify tool arguments match schema
```

### Issue: Chat doesn't use tools

**Solution:**
1. Ensure tools are passed to AI: Check `tools` parameter in chat options
2. Verify tool descriptions are clear and helpful
3. Make sure user message clearly relates to tool capabilities

## Examples

See:
- `/examples/test-mcp-chat.ts` - Backend testing
- `/examples/chat-with-mcp-ui.tsx` - Frontend UI component

## Next Steps

1. **Add Permission System**: Require user approval for sensitive tools
2. **Audit Logging**: Track all tool executions in database
3. **Parallel Execution**: Run multiple tool calls concurrently
4. **Caching**: Cache identical tool call results
5. **Streaming Progress**: Stream tool execution progress to UI
