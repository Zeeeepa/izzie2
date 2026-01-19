# MCP (Model Context Protocol) Integration Analysis

**Research Date**: 2026-01-18
**Project**: izzie2 (Next.js Chat Application)
**Objective**: Evaluate MCP integration requirements for enabling tool-augmented AI chat

---

## Executive Summary

Model Context Protocol (MCP) is an open standard that enables AI applications to connect to external tools, data sources, and services through a standardized interface. This research examines the current state of the izzie2 codebase and identifies requirements for full MCP integration with UI management.

**Key Findings**:
- ✅ **No existing MCP code** - Clean slate for implementation
- ✅ **Next.js 16+ native support** available via built-in `/_next/mcp` endpoint
- ✅ **Existing chat infrastructure** can be extended with MCP tool calling
- 🔨 **Missing**: MCP server configuration UI, tool discovery, and execution flow

---

## 1. Current State Analysis

### 1.1 Existing Codebase Assessment

**MCP-Related Code**: None found
- No MCP dependencies in `package.json`
- No MCP server/client implementation
- No MCP-related files in `src/lib/` or `src/app/api/`

**Relevant Existing Infrastructure**:

| Component | Location | Status | MCP Relevance |
|-----------|----------|--------|---------------|
| Chat API | `src/app/api/chat/route.ts` | ✅ Production | Can integrate MCP tool calls |
| AI Client | `src/lib/ai/client.ts` | ✅ Production | Uses OpenRouter (OpenAI-compatible) |
| Streaming | Chat API (SSE) | ✅ Production | Compatible with MCP streaming |
| Auth | `src/lib/auth/` | ✅ Production | Required for MCP authorization |
| Dashboard | `src/app/dashboard/` | ✅ Production | Can add MCP settings UI |

**Key Chat Implementation Details**:
- Streams responses via Server-Sent Events (SSE)
- Uses OpenRouter client with OpenAI SDK
- Session-based conversation tracking
- Context retrieval from Weaviate (entities + memories)
- Structured LLM responses with JSON format

### 1.2 Dependencies

**Current AI Stack**:
```json
{
  "@anthropic-ai/sdk": "^0.71.2",  // Not actively used for chat
  "openai": "^6.15.0",              // Used via OpenRouter proxy
  "inngest": "^3.48.1",             // Event-driven functions
  "weaviate-client": "^3.10.0"      // Vector search
}
```

**Missing MCP Dependencies**:
- `@modelcontextprotocol/sdk` - Core MCP TypeScript SDK
- `@vercel/mcp-adapter` or `mcp-handler` - Next.js MCP integration
- `zod` (present at v4.3.5) - Already available for schema validation

---

## 2. MCP Architecture Overview

### 2.1 Protocol Fundamentals

**Communication Pattern**:
```
┌─────────────┐         JSON-RPC 2.0         ┌─────────────┐
│  MCP Host   │◄──────────────────────────────│ MCP Server  │
│  (AI App)   │                               │  (Tools)    │
│             │──────────────────────────────►│             │
│  - Claude   │  Requests: list/call tools    │  - Notion   │
│  - ChatGPT  │  Responses: tool results      │  - Slack    │
│  - Custom   │                               │  - GitHub   │
└─────────────┘                               └─────────────┘
```

**Core Primitives**:

1. **Tools** - Functions AI can execute
   - Input schema (Zod/JSON Schema)
   - Description for AI understanding
   - Handler returns `{ content: [...] }`

2. **Resources** - Read-only data access
   - URI-addressable (`file://`, `http://`, custom schemes)
   - Metadata and templating support
   - Contextual information for AI

3. **Prompts** - Reusable message templates
   - Dynamic argument substitution
   - Multi-turn conversation starters
   - User-friendly abstractions

### 2.2 Transport Mechanisms

| Transport | Use Case | Connection | Auth |
|-----------|----------|------------|------|
| **stdio** | Local processes | Child process spawned by client | Process isolation |
| **SSE** (Server-Sent Events) | Remote HTTP | Persistent HTTP connection | OAuth/API keys |
| **Streamable HTTP** | Web apps | Standard HTTP + streaming | Bearer tokens |

**Next.js Compatibility**:
- ✅ **SSE**: Native Next.js support via Route Handlers
- ✅ **Streamable HTTP**: Vercel MCP Adapter compatible
- ❌ **stdio**: Not applicable for web apps (requires proxy like `mcp-remote`)

### 2.3 Message Format (JSON-RPC 2.0)

**Tool Call Request**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_emails",
    "arguments": {
      "query": "project status",
      "limit": 10
    }
  }
}
```

**Tool Call Response**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 3 emails about project status..."
      }
    ]
  }
}
```

---

## 3. Implementation Patterns for Next.js

### 3.1 Option 1: Next.js 16+ Built-in MCP (Development Only)

**Features**:
- Automatic MCP endpoint at `/_next/mcp`
- Exposes development-time internals
- Requires `next-devtools-mcp` package

**Limitations**:
- ⚠️ **Development only** - Not for production chat features
- Limited to Next.js introspection tools
- Not suitable for custom business logic

**Verdict**: ❌ Not applicable for production MCP tool integration

### 3.2 Option 2: Vercel MCP Adapter (Recommended)

**Package**: `@vercel/mcp-adapter`

**Setup**:
```typescript
// app/api/mcp/route.ts
import { createMcpHandler } from '@vercel/mcp-adapter';

const server = new Server({
  name: 'izzie-mcp',
  version: '1.0.0'
});

// Register tools
server.registerTool(
  'search_emails',
  {
    title: 'Search Emails',
    description: 'Search through user emails',
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(50).default(10)
    })
  },
  async (args) => {
    // Implementation
    return { content: [{ type: 'text', text: results }] };
  }
);

export const { GET, POST } = createMcpHandler(server, {
  basePath: '/api',
  maxDuration: 60
});
```

**Transport Support**:
- ✅ Streamable HTTP (default)
- ✅ SSE (requires Redis for session management)

**Pros**:
- Official Vercel support
- Minimal boilerplate
- Authentication wrapper included
- Works with Next.js Route Handlers

**Cons**:
- Requires Redis for SSE transport (optional)
- Newer package (less battle-tested)

### 3.3 Option 3: mcp-handler (Multi-framework)

**Package**: `mcp-handler`

**Similar API** to Vercel adapter but supports multiple frameworks:
- Next.js
- Nuxt
- SvelteKit
- Generic Node.js

**Security Note**: Requires `@modelcontextprotocol/sdk@1.25.2+` (earlier versions have CVE)

**Verdict**: ✅ Viable alternative if Vercel adapter doesn't meet needs

---

## 4. MCP Client Integration for Chat

### 4.1 Architecture Approach

**Current Chat Flow**:
```
User Message → Chat API → OpenRouter → Stream Response
                ↓
         Weaviate Context
```

**MCP-Enhanced Flow**:
```
User Message → Chat API → LLM (OpenRouter)
                ↓              ↓
         Weaviate Context    Tool Calls?
                              ↓
                         MCP Tool Execution
                              ↓
                         Results → LLM
                              ↓
                         Final Response
```

### 4.2 Tool Execution Pattern

**Anthropic SDK Approach** (if switching from OpenRouter):
```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Find emails about project' }],
  tools: [
    {
      name: 'search_emails',
      description: 'Search through user emails',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer', default: 10 }
        },
        required: ['query']
      }
    }
  ]
});

// Check for tool use
if (response.stop_reason === 'tool_use') {
  const toolUse = response.content.find(c => c.type === 'tool_use');
  // Execute tool via MCP
  const result = await executeMcpTool(toolUse.name, toolUse.input);
  // Continue conversation with result
}
```

**OpenAI SDK Approach** (current OpenRouter client):
```typescript
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
  tools: [
    {
      type: 'function',
      function: {
        name: 'search_emails',
        description: 'Search through user emails',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'integer', default: 10 }
          },
          required: ['query']
        }
      }
    }
  ],
  tool_choice: 'auto'
});

// Check for tool calls
const toolCall = completion.choices[0].message.tool_calls?.[0];
if (toolCall) {
  // Execute via MCP
  const result = await executeMcpTool(
    toolCall.function.name,
    JSON.parse(toolCall.function.arguments)
  );
}
```

**Key Decision**: OpenRouter supports function calling, so current OpenAI SDK can be extended with tools.

### 4.3 MCP Client SDK Integration

**Lightweight MCP Client** (for calling external MCP servers):
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// Connect to external MCP server
const transport = new SSEClientTransport({
  url: 'https://external-mcp-server.com/mcp'
});

const client = new Client({
  name: 'izzie-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);

// List available tools
const { tools } = await client.request({
  method: 'tools/list'
}, ListToolsResultSchema);

// Call tool
const result = await client.request({
  method: 'tools/call',
  params: {
    name: 'search_emails',
    arguments: { query: 'project', limit: 10 }
  }
}, CallToolResultSchema);

// Always close client
await client.close();
```

**Use Cases**:
1. **Internal MCP Server**: izzie2 hosts MCP server for external AI clients
2. **External MCP Servers**: izzie2 calls third-party MCP servers (Notion, Slack, etc.)
3. **Hybrid**: Both directions (most flexible)

---

## 5. UI Requirements for MCP Management

### 5.1 MCP Server Configuration UI

**Reference Implementations**:
- **Claude Desktop**: JSON config file + Developer Settings panel
- **Cline VSCode Extension**: Server list with enable/disable toggles
- **LibreChat**: YAML-based config with UI editor

**Required UI Components**:

1. **Server List Panel**
   - Display all configured MCP servers
   - Status indicator (connected/disconnected/error)
   - Enable/disable toggle per server
   - Add/remove server buttons

2. **Add Server Modal**
   - Server name (user-friendly identifier)
   - Transport type: `stdio` | `sse` | `streamable-http`
   - **For stdio**: Command + args (e.g., `npx -y @modelcontextprotocol/server-github`)
   - **For SSE/HTTP**: URL + headers (auth tokens)
   - Environment variables (masked for secrets)
   - Test connection button

3. **Server Detail View**
   - Connection status
   - Available tools (from `tools/list`)
   - Available resources (from `resources/list`)
   - Prompts (from `prompts/list`)
   - Logs/errors
   - Restart server button

4. **Tool Permissions**
   - Per-tool "always allow" checkbox
   - Manual approval flow (popup during chat)
   - Audit log of tool executions

**Example UI Structure**:
```
/dashboard/mcp
├── Server List (sidebar)
│   ├── Local Servers (stdio)
│   │   └── [server-name] (status indicator)
│   └── Remote Servers (SSE)
│       └── [server-name] (status indicator)
├── Server Detail (main panel)
│   ├── Connection Info
│   ├── Tools Tab
│   ├── Resources Tab
│   └── Logs Tab
└── Add Server Button (floating action)
```

### 5.2 Configuration Storage

**Option 1: User Preferences Table** (Recommended)
```typescript
// drizzle schema
export const mcpServers = pgTable('mcp_servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  transport: text('transport').notNull(), // 'stdio' | 'sse' | 'streamable-http'
  config: jsonb('config').notNull(), // { command, args } | { url, headers }
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});
```

**Option 2: JSON File** (Like Claude Desktop)
- Less flexible (single config per deployment)
- Easier for self-hosted users
- Requires file system access

**Verdict**: Database storage (Option 1) for multi-user SaaS, with optional JSON export

### 5.3 Tool Discovery and Display

**During Chat**:

1. **Pre-execution Preview**:
   ```
   🤖 Izzie wants to use tool: search_emails

   Query: "project status update"
   Limit: 10

   [Allow] [Deny] [Always Allow]
   ```

2. **Execution Progress**:
   ```
   🔧 Searching emails... (via MCP: gmail-server)
   ```

3. **Result Display**:
   ```
   📧 Found 3 emails matching "project status update"

   [Results collapsed by default, expand for details]
   ```

**Tool Call Format in Messages**:
```typescript
interface MessageWithTool extends Message {
  toolCalls?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    result?: {
      success: boolean;
      content: string;
      metadata?: Record<string, unknown>;
    };
    status: 'pending' | 'approved' | 'denied' | 'completed' | 'failed';
  }[];
}
```

### 5.4 MCP Apps UI (Emerging Standard)

**New Capability (2025/2026)**: MCP servers can return interactive UI components

**Pattern**:
```typescript
// Tool returns UI resource reference
{
  content: [
    {
      type: 'resource',
      resource: {
        uri: 'ui://product-carousel',
        mimeType: 'text/html'
      }
    }
  ]
}

// Client fetches and renders UI
<ui-resource-renderer
  uri="ui://product-carousel"
  sandbox="allow-scripts"
/>
```

**Security**: Sandboxed iframes with restricted permissions

**Use Cases**:
- Product carousels (e-commerce)
- Data visualizations (charts, graphs)
- Interactive forms (user input)
- Rich previews (documents, media)

**Implementation**: Use `@mcp-ui/client` React components

---

## 6. Integration with Existing Chat

### 6.1 Changes to Chat API Route

**New Imports**:
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getMcpServers, connectToMcpServer } from '@/lib/mcp/client';
import { executeMcpTool } from '@/lib/mcp/executor';
```

**Modified Flow**:
```typescript
// 1. Get user's enabled MCP servers
const mcpServers = await getMcpServers(userId);
const connectedClients = await Promise.all(
  mcpServers.map(s => connectToMcpServer(s))
);

// 2. List all available tools
const allTools = await gatherMcpTools(connectedClients);

// 3. Send message with tools
const completion = await aiClient.chat(messages, {
  tools: allTools, // MCP tools + built-in tools
  toolChoice: 'auto'
});

// 4. Execute tool calls via MCP
if (completion.toolCalls) {
  for (const call of completion.toolCalls) {
    const result = await executeMcpTool(
      call.name,
      call.arguments,
      connectedClients
    );
    // Add to message history
  }
  // Continue conversation with results
}

// 5. Close MCP connections
await Promise.all(connectedClients.map(c => c.close()));
```

### 6.2 New API Endpoints

**MCP Server Management**:

```
POST /api/mcp/servers          - Add MCP server
GET /api/mcp/servers           - List user's servers
PATCH /api/mcp/servers/:id     - Update server config
DELETE /api/mcp/servers/:id    - Remove server
POST /api/mcp/servers/:id/test - Test connection
```

**Tool Discovery**:

```
GET /api/mcp/tools             - List all available tools (from all servers)
POST /api/mcp/tools/:name/execute - Manual tool execution (testing)
```

**Internal MCP Server** (for external AI clients):

```
GET /api/mcp                   - MCP endpoint (SSE/Streamable HTTP)
POST /api/mcp                  - Tool execution
```

### 6.3 Frontend Chat Component Changes

**Tool Call UI State**:
```typescript
interface ToolCallState {
  pending: ToolCall[];       // Awaiting user approval
  approved: ToolCall[];      // User approved, executing
  completed: ToolCall[];     // Finished with results
  denied: ToolCall[];        // User rejected
}

const [toolCalls, setToolCalls] = useState<ToolCallState>({
  pending: [],
  approved: [],
  completed: [],
  denied: []
});
```

**Approval Modal Component**:
```tsx
<ToolApprovalModal
  tool={pendingTool}
  onApprove={() => approveTool(pendingTool.id)}
  onDeny={() => denyTool(pendingTool.id)}
  onAlwaysAllow={() => {
    approveTool(pendingTool.id);
    saveToolPermission(pendingTool.name, 'always');
  }}
/>
```

---

## 7. Security and Trust Model

### 7.1 MCP Security Requirements

**User Consent Mandatory**:
- ✅ Explicit approval before any tool execution
- ✅ Clear UI showing what tool will do
- ✅ "Always allow" option for trusted tools
- ❌ No silent tool execution

**Data Privacy**:
- ✅ User controls what data MCP servers can access
- ✅ Explicit consent before exposing resources
- ✅ Audit log of all MCP interactions
- ✅ Scoped API tokens per server

**Tool Safety**:
- ⚠️ Tools are arbitrary code execution
- ✅ Sandbox MCP server processes (stdio isolation)
- ✅ Network restrictions for SSE servers
- ✅ Rate limiting and timeout controls

### 7.2 Implementation Checklist

**Authentication/Authorization**:
- [ ] OAuth2 flow for remote MCP servers (RFC 8707 resource indicators)
- [ ] API key management (encrypted storage)
- [ ] Per-server token scoping
- [ ] Token refresh handling

**User Controls**:
- [ ] Tool approval modal before execution
- [ ] "Always allow" permission storage
- [ ] Revoke permissions UI
- [ ] Audit log viewer

**Rate Limiting**:
- [ ] Max tool calls per minute per user
- [ ] Timeout for long-running tools (60s default)
- [ ] Concurrent tool execution limits

**Error Handling**:
- [ ] Graceful degradation if MCP server offline
- [ ] Clear error messages to user
- [ ] Retry logic with exponential backoff
- [ ] Fallback to non-tool responses

---

## 8. Implementation Roadmap

### Phase 1: MCP Server (Internal Tools) - 2 weeks

**Goal**: Enable external AI clients to call izzie2 tools

**Tasks**:
1. Install `@vercel/mcp-adapter` or `mcp-handler`
2. Create `/api/mcp/route.ts` with basic server
3. Register 3-5 core tools:
   - `search_emails` - Query user's email data
   - `search_calendar` - Find calendar events
   - `get_entities` - Retrieve extracted entities
   - `search_memories` - Query conversation memories
   - `create_task` - Add to user's task list
4. Add authentication wrapper (user-scoped tools)
5. Deploy and test with Claude Desktop

**Deliverables**:
- Working MCP server endpoint
- 5 callable tools
- Documentation for connecting external clients

### Phase 2: MCP Client (External Tools) - 3 weeks

**Goal**: izzie2 chat can call external MCP servers

**Tasks**:
1. Database schema for MCP server storage
2. Backend APIs for server CRUD operations
3. MCP client connection manager (singleton per server)
4. Tool discovery and caching layer
5. Tool execution with error handling
6. Chat API integration (tool calls in conversation flow)

**Deliverables**:
- MCP server management APIs
- Tool execution in chat responses
- Basic error handling

### Phase 3: UI for MCP Management - 2 weeks

**Goal**: Users can configure MCP servers via dashboard

**Tasks**:
1. Dashboard page: `/dashboard/mcp`
2. Server list component (sidebar)
3. Add/edit server modal
4. Server detail view (tools, resources, logs)
5. Connection status indicators
6. Test connection feature

**Deliverables**:
- Complete MCP settings UI
- Server management interface
- User documentation

### Phase 4: Tool Approval UX - 1 week

**Goal**: Secure tool execution with user consent

**Tasks**:
1. Tool approval modal component
2. "Always allow" permission storage
3. Tool execution progress indicators
4. Result display in chat messages
5. Audit log of tool calls

**Deliverables**:
- Tool approval flow
- Permission management
- Audit logging

### Phase 5: Advanced Features - 3 weeks

**Goal**: Enhanced MCP capabilities

**Tasks**:
1. MCP Apps UI support (interactive components)
2. Resource browser (MCP resources as chat context)
3. Prompt templates from MCP servers
4. Multi-server tool orchestration
5. Tool result streaming (for long operations)
6. Advanced error recovery

**Deliverables**:
- MCP Apps rendering
- Resource integration
- Prompt library
- Production-ready system

**Total Estimated Timeline**: 11 weeks (2.75 months)

---

## 9. Technical Decisions

### 9.1 MCP Package Selection

**Recommendation**: `@vercel/mcp-adapter`

**Rationale**:
- Official Vercel support (maintained)
- Minimal boilerplate
- Next.js Route Handler integration
- Authentication helpers included
- SSE + Streamable HTTP support

**Alternative**: `mcp-handler` (if multi-framework support needed)

### 9.2 Transport Protocol

**For Internal Server** (izzie2 as MCP server):
- ✅ **Streamable HTTP** (default)
- ⚠️ **SSE** (optional, requires Redis)

**For External Clients** (izzie2 calling other servers):
- ✅ **SSE** (for remote servers)
- ❌ **stdio** (not applicable for web app, would need proxy)

### 9.3 AI Model Strategy

**Current**: OpenRouter (multi-model proxy)

**For Tool Calling**:
- Option 1: Continue with OpenRouter + OpenAI SDK (supports function calling)
- Option 2: Switch to Anthropic SDK (native tool use support)

**Recommendation**: Continue with OpenRouter but add Anthropic SDK as fallback

**Rationale**:
- OpenRouter supports tool calling via OpenAI format
- Keep model flexibility (can route to Claude, GPT-4, etc.)
- Add Anthropic SDK for native Claude features (computer use, prompt caching)

### 9.4 Storage Strategy

**MCP Server Configurations**: PostgreSQL (existing Drizzle schema)

**Tool Permissions**: In-memory cache + DB persistence

**Audit Logs**: Separate table with retention policy

**Secrets**: Encrypted storage using existing auth infrastructure

---

## 10. Known Challenges and Mitigations

### 10.1 Challenge: stdio Servers in Web App

**Problem**: MCP stdio servers are designed for local processes (can't spawn from browser)

**Mitigation**:
- Use SSE/HTTP servers only for remote integrations
- For local tools, build them directly into izzie2 (not via MCP)
- If stdio servers needed, run proxy like `mcp-remote` in separate process

### 10.2 Challenge: Tool Call Latency

**Problem**: Multi-hop tool execution adds latency

**Flow**: User → LLM → Tool Decision → MCP Server → Tool Execution → LLM → Response

**Mitigations**:
- Parallel tool execution when possible
- Stream partial responses before tool results
- Cache tool results (when safe)
- Show "thinking..." indicators during tool calls

### 10.3 Challenge: Error Recovery

**Problem**: MCP server failures mid-conversation

**Scenarios**:
- Server offline/unreachable
- Tool execution timeout
- Invalid tool arguments
- Permission denied

**Mitigations**:
- Graceful degradation (continue conversation without tool)
- Retry logic with exponential backoff
- Clear error messages to user
- Fallback to non-tool responses

### 10.4 Challenge: User Overwhelm

**Problem**: Too many tool approval prompts

**Mitigations**:
- "Always allow" for trusted tools
- Batch approval (approve multiple tools at once)
- Smart defaults (pre-approve read-only tools)
- Progressive disclosure (show tools only when relevant)

---

## 11. Reference Architecture

### 11.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        izzie2 Next.js App                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Chat UI (Dashboard)                     │  │
│  │  - Message input/display                                 │  │
│  │  - Tool approval modal                                   │  │
│  │  - MCP server settings                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Chat API (/api/chat)                         │  │
│  │  - Session management                                     │  │
│  │  - Context retrieval (Weaviate)                          │  │
│  │  - LLM streaming (OpenRouter)                            │  │
│  │  - Tool orchestration ◄─────┐                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                │                  │
│                             ▼                ▼                  │
│  ┌─────────────────┐  ┌──────────────────────────────────┐    │
│  │  MCP Client     │  │    MCP Server (/api/mcp)         │    │
│  │  (Outbound)     │  │    (Inbound)                     │    │
│  │                 │  │                                  │    │
│  │  - Connect to   │  │  - Expose izzie2 tools          │    │
│  │    external     │  │    • search_emails              │    │
│  │    servers      │  │    • search_calendar            │    │
│  │  - List tools   │  │    • get_entities               │    │
│  │  - Execute      │  │    • create_task                │    │
│  │    tools        │  │  - Auth wrapper                 │    │
│  └─────────────────┘  └──────────────────────────────────┘    │
│         │                          │                           │
│         │                          │                           │
└─────────┼──────────────────────────┼───────────────────────────┘
          │                          │
          ▼                          ▼
  ┌───────────────┐        ┌──────────────────┐
  │ External MCP  │        │  External AI      │
  │ Servers       │        │  Clients          │
  │               │        │                   │
  │ • Notion      │        │ • Claude Desktop  │
  │ • Slack       │        │ • ChatGPT         │
  │ • GitHub      │        │ • Custom apps     │
  └───────────────┘        └──────────────────┘
```

### 11.2 Data Flow

**User Sends Message**:
```
1. POST /api/chat { message: "Find emails about X" }
2. Chat API authenticates user
3. Retrieve conversation context (Weaviate)
4. Connect to user's enabled MCP servers
5. List available tools from all servers
6. Send to LLM with tools array
7. LLM decides to call `search_emails` tool
8. Chat API checks user permissions
   - If no permission: Show approval modal
   - If "always allow": Proceed
9. Execute tool via MCP client
10. Receive tool result
11. Send result back to LLM
12. LLM generates final response
13. Stream response to user
14. Close MCP connections
```

---

## 12. Example Code Snippets

### 12.1 MCP Server Route

```typescript
// src/app/api/mcp/route.ts
import { createMcpHandler } from '@vercel/mcp-adapter';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { searchEmails } from '@/lib/gmail/search';

const server = new Server({
  name: 'izzie-mcp-server',
  version: '1.0.0'
});

// Register tools
server.registerTool(
  'search_emails',
  {
    title: 'Search Emails',
    description: 'Search through the user\'s Gmail inbox',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      limit: z.number().int().min(1).max(50).default(10).describe('Max results')
    })
  },
  async (args, context) => {
    // Get authenticated user from context
    const userId = context.userId; // Set by auth wrapper

    // Execute search
    const results = await searchEmails(userId, args.query, args.limit);

    // Return MCP-formatted response
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  }
);

server.registerTool(
  'search_calendar',
  {
    title: 'Search Calendar',
    description: 'Find events in the user\'s Google Calendar',
    inputSchema: z.object({
      query: z.string().optional().describe('Search query'),
      startDate: z.string().optional().describe('Start date (ISO format)'),
      endDate: z.string().optional().describe('End date (ISO format)'),
      limit: z.number().int().min(1).max(20).default(10)
    })
  },
  async (args, context) => {
    const userId = context.userId;
    const events = await searchCalendar(userId, args);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(events, null, 2)
        }
      ]
    };
  }
);

// Create handler with auth
export const { GET, POST } = createMcpHandler(server, {
  basePath: '/api',
  maxDuration: 60,
  auth: async (request) => {
    // Authenticate request
    const session = await requireAuth(request);
    return {
      userId: session.user.id
    };
  }
});
```

### 12.2 MCP Client Manager

```typescript
// src/lib/mcp/client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { db } from '@/lib/db';
import { mcpServers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'sse' | 'streamable-http';
  url: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export class McpClientManager {
  private clients: Map<string, Client> = new Map();

  /**
   * Connect to MCP server
   */
  async connect(config: McpServerConfig): Promise<Client> {
    if (this.clients.has(config.id)) {
      return this.clients.get(config.id)!;
    }

    const transport = new SSEClientTransport({
      url: config.url,
      headers: config.headers
    });

    const client = new Client({
      name: 'izzie-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await client.connect(transport);
    this.clients.set(config.id, client);

    return client;
  }

  /**
   * Get all tools from connected servers
   */
  async getAllTools(userId: string): Promise<ToolDefinition[]> {
    const servers = await db
      .select()
      .from(mcpServers)
      .where(and(
        eq(mcpServers.userId, userId),
        eq(mcpServers.enabled, true)
      ));

    const allTools: ToolDefinition[] = [];

    for (const server of servers) {
      try {
        const client = await this.connect(server);
        const { tools } = await client.request({
          method: 'tools/list'
        }, ListToolsResultSchema);

        // Prefix tool names with server ID to avoid conflicts
        const prefixedTools = tools.map(tool => ({
          ...tool,
          name: `${server.id}:${tool.name}`,
          serverId: server.id,
          serverName: server.name
        }));

        allTools.push(...prefixedTools);
      } catch (error) {
        console.error(`Failed to connect to MCP server ${server.name}:`, error);
        // Continue with other servers
      }
    }

    return allTools;
  }

  /**
   * Execute tool via MCP
   */
  async executeTool(
    toolName: string,
    arguments: Record<string, unknown>,
    userId: string
  ): Promise<ToolResult> {
    // Parse server ID from prefixed tool name
    const [serverId, actualToolName] = toolName.split(':');

    const server = await db
      .select()
      .from(mcpServers)
      .where(and(
        eq(mcpServers.id, serverId),
        eq(mcpServers.userId, userId)
      ))
      .limit(1);

    if (!server[0]) {
      throw new Error(`MCP server ${serverId} not found`);
    }

    const client = await this.connect(server[0]);

    const result = await client.request({
      method: 'tools/call',
      params: {
        name: actualToolName,
        arguments
      }
    }, CallToolResultSchema);

    return result;
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    await Promise.all(
      Array.from(this.clients.values()).map(c => c.close())
    );
    this.clients.clear();
  }

  /**
   * Close specific connection
   */
  async close(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.close();
      this.clients.delete(serverId);
    }
  }
}

// Singleton instance
let managerInstance: McpClientManager | null = null;

export function getMcpClientManager(): McpClientManager {
  if (!managerInstance) {
    managerInstance = new McpClientManager();
  }
  return managerInstance;
}
```

### 12.3 Enhanced Chat API with MCP

```typescript
// src/app/api/chat/route.ts (modified)

// ... existing imports ...
import { getMcpClientManager } from '@/lib/mcp/client';
import { checkToolPermission, requestToolApproval } from '@/lib/mcp/permissions';

export async function POST(request: NextRequest) {
  try {
    const authSession = await requireAuth(request);
    const userId = authSession.user.id;

    const body: ChatRequest = await request.json();
    const { message, sessionId } = body;

    // ... existing session management ...

    // Connect to MCP servers and get tools
    const mcpManager = getMcpClientManager();
    const mcpTools = await mcpManager.getAllTools(userId);

    // Convert MCP tools to LLM format
    const toolsForLlm = mcpTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));

    // ... existing context retrieval ...

    // Send to LLM with tools
    const completion = await aiClient.chat(messages, {
      model: MODELS.GENERAL,
      tools: toolsForLlm,
      toolChoice: 'auto'
    });

    // Check for tool calls
    if (completion.message.tool_calls) {
      const toolResults = [];

      for (const toolCall of completion.message.tool_calls) {
        // Check permissions
        const hasPermission = await checkToolPermission(
          userId,
          toolCall.function.name
        );

        if (!hasPermission) {
          // Request approval (blocks until user responds)
          const approved = await requestToolApproval(
            userId,
            toolCall.function.name,
            toolCall.function.arguments
          );

          if (!approved) {
            // User denied - skip tool
            continue;
          }
        }

        // Execute tool via MCP
        try {
          const result = await mcpManager.executeTool(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments),
            userId
          );

          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: JSON.stringify(result.content)
          });
        } catch (error) {
          console.error(`Tool execution failed:`, error);
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: `Error: ${error.message}`
          });
        }
      }

      // Continue conversation with tool results
      if (toolResults.length > 0) {
        const finalCompletion = await aiClient.chat([
          ...messages,
          completion.message,
          ...toolResults
        ], {
          model: MODELS.GENERAL
        });

        // Stream final response
        // ... existing streaming logic ...
      }
    }

    // ... rest of existing code ...

  } finally {
    // Clean up MCP connections
    await getMcpClientManager().closeAll();
  }
}
```

---

## 13. Resources and References

### Official Documentation
- [MCP Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25) - Core protocol specification
- [MCP GitHub Repository](https://github.com/modelcontextprotocol/modelcontextprotocol) - Official spec repo
- [Model Context Protocol - Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol) - Overview and history

### Next.js Integration
- [Next.js MCP Guide](https://nextjs.org/docs/app/guides/mcp) - Official Next.js documentation
- [Vercel MCP Template](https://vercel.com/templates/next.js/model-context-protocol-mcp-with-next-js) - Starter template
- [Vercel MCP Handler](https://github.com/vercel/mcp-handler) - NPM package for Next.js/Nuxt
- [mcp-handler Package](https://github.com/vercel/mcp-handler) - Multi-framework support

### Client Configuration
- [Claude Desktop MCP Setup](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) - Official guide
- [Cline MCP Configuration](https://docs.cline.bot/mcp/configuring-mcp-servers) - VSCode extension example
- [LibreChat MCP Config](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers) - YAML-based config

### UI Patterns and MCP Apps
- [MCP Apps Blog Post](http://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/) - Interactive UI introduction
- [MCP-UI SDK](https://mcpui.dev/guide/introduction) - Interactive components library
- [Shopify MCP UI](https://shopify.engineering/mcp-ui-breaking-the-text-wall) - Real-world implementation
- [WorkOS MCP-UI Overview](https://workos.com/blog/mcp-ui-a-technical-deep-dive-into-interactive-agent-interfaces) - Technical deep dive

### Transport and Architecture
- [MCP Stdio vs SSE](https://medium.com/@vkrishnan9074/mcp-clients-stdio-vs-sse-a53843d9aabb) - Transport comparison
- [SSE Transport Guide](https://mcp-framework.com/docs/Transports/sse/) - MCP Framework docs
- [MCP Proxy Tool](https://github.com/sparfenyuk/mcp-proxy) - Bridge stdio and HTTP

### Security and Standards
- [MCP Security Updates (June 2025)](https://auth0.com/blog/mcp-specs-update-all-about-auth/) - OAuth2 resource indicators
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) - Resource Indicators for OAuth 2.0
- [MCP Trust Model](https://modelcontextprotocol.io/specification/2025-11-25) - Section on security

### Additional Resources
- [LiteLLM MCP Integration](https://docs.litellm.ai/docs/mcp) - Multi-provider proxy
- [Spring AI MCP](https://docs.spring.io/spring-ai/reference/api/mcp/mcp-stdio-sse-server-boot-starter-docs.html) - Java implementation
- [Composio MCP Tutorial](https://composio.dev/blog/building-your-own-mcp-client-from-scratch) - Build from scratch guide

---

## 14. Conclusion

### What Exists
- **None**: No MCP code in the current izzie2 codebase
- **Compatible Infrastructure**: Chat API, authentication, database ready for MCP integration
- **OpenAI SDK**: Already supports function calling (compatible with MCP tools)

### What Needs to Be Built

#### 14.1 Backend (Core MCP Integration)
1. **MCP Server** (`/api/mcp`) - Expose izzie2 tools to external AI clients
   - 5 core tools (emails, calendar, entities, memories, tasks)
   - Authentication wrapper
   - SSE/Streamable HTTP transport

2. **MCP Client Manager** - Call external MCP servers
   - Connection pooling
   - Tool discovery
   - Tool execution with error handling

3. **Database Schema** - Store MCP configurations
   - `mcp_servers` table
   - `tool_permissions` table
   - `tool_audit_log` table

4. **APIs** - Server management endpoints
   - CRUD for MCP servers
   - Test connection
   - List tools from all servers

#### 14.2 Frontend (UI for MCP Management)
1. **MCP Settings Page** (`/dashboard/mcp`)
   - Server list sidebar
   - Add/edit server modal
   - Server detail view
   - Connection status indicators

2. **Tool Approval UI** (in chat)
   - Tool call approval modal
   - "Always allow" permission
   - Tool execution progress
   - Result display

3. **Audit Log Viewer**
   - History of tool executions
   - Filter by server/tool
   - Export capabilities

#### 14.3 Chat Integration
1. **Enhanced Chat API**
   - Load MCP tools before LLM call
   - Execute tool calls via MCP client
   - Handle multi-turn tool conversations
   - Streaming with tool execution

2. **Permission System**
   - Check tool permissions
   - Request user approval
   - Store "always allow" preferences
   - Audit logging

### Success Criteria

**Phase 1 Complete**: External AI clients can call izzie2 tools via MCP
**Phase 2 Complete**: izzie2 chat can execute tools from external MCP servers
**Phase 3 Complete**: Users can configure MCP servers via dashboard
**Phase 4 Complete**: Secure tool execution with user consent
**Phase 5 Complete**: Production-ready with advanced features (MCP Apps UI, etc.)

### Estimated Effort
- **Backend**: 4-5 weeks
- **Frontend**: 3-4 weeks
- **Testing & Polish**: 2-3 weeks
- **Total**: 9-12 weeks (2-3 months)

### Next Steps
1. Review this research with stakeholders
2. Prioritize which direction to build first (MCP server vs client)
3. Set up development environment with MCP SDK
4. Create proof-of-concept with 1-2 tools
5. Iterate on UI/UX design
6. Build Phase 1 (MCP server with internal tools)

---

**Research Completed**: 2026-01-18
**Researcher**: Claude Code (Research Agent)
**Status**: Ready for implementation planning
