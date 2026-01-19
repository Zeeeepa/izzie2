# MCP Server Configuration Schema Migration

## Overview
Added database schema for MCP (Model Context Protocol) server configurations to support user-managed MCP servers with tool permissions and audit logging.

## Schema Changes

### New Tables

#### 1. `mcp_servers`
Stores user-configured MCP servers supporting stdio, SSE, and HTTP transports.

**Columns:**
- `id` (text, PK) - UUID generated via crypto.randomUUID()
- `userId` (text, FK → users.id) - Owner of the server configuration
- `name` (text, required) - Display name
- `description` (text, nullable) - Optional description
- `transport` (text, required) - Transport type: 'stdio' | 'sse' | 'http'

**Transport-specific columns:**
- **stdio transport:**
  - `command` (text) - Executable command
  - `args` (jsonb) - Array of command arguments
  - `env` (jsonb) - Environment variables object

- **SSE/HTTP transport:**
  - `url` (text) - Server endpoint URL
  - `headers` (jsonb) - HTTP headers object

**Meta columns:**
- `enabled` (boolean, default: true) - Whether server is active
- `createdAt` (timestamp, default: now())
- `updatedAt` (timestamp, default: now())

**Indexes:**
- `mcp_servers_user_id_idx` on (userId)
- `mcp_servers_enabled_idx` on (enabled)

#### 2. `mcp_tool_permissions`
Tracks "Always Allow" permissions for specific tools to bypass approval prompts.

**Columns:**
- `id` (text, PK) - UUID
- `userId` (text, FK → users.id) - User granting permission
- `serverId` (text, FK → mcp_servers.id) - Server containing the tool
- `toolName` (text, required) - Name of the tool
- `alwaysAllow` (boolean, default: false) - Auto-approval flag
- `createdAt` (timestamp, default: now())

**Indexes:**
- `mcp_tool_permissions_user_id_idx` on (userId)
- `mcp_tool_permissions_server_id_idx` on (serverId)
- `mcp_tool_permissions_unique` on (userId, serverId, toolName) - Ensures one permission per user/server/tool combination

#### 3. `mcp_tool_audit_log`
Audit trail for all MCP tool executions (observability and debugging).

**Columns:**
- `id` (text, PK) - UUID
- `userId` (text, FK → users.id) - User who executed the tool
- `serverId` (text, required) - Server ID (no FK to allow historical data if server deleted)
- `toolName` (text, required) - Tool that was executed
- `arguments` (jsonb) - Input arguments object
- `result` (jsonb) - Tool execution result
- `error` (text, nullable) - Error message if execution failed
- `duration` (integer, nullable) - Execution time in milliseconds
- `createdAt` (timestamp, default: now())

**Indexes:**
- `mcp_tool_audit_log_user_id_idx` on (userId)
- `mcp_tool_audit_log_server_id_idx` on (serverId)
- `mcp_tool_audit_log_tool_name_idx` on (toolName)
- `mcp_tool_audit_log_created_at_idx` on (createdAt)

### TypeScript Types Exported

```typescript
// Select (read) types
export type McpServer = typeof mcpServers.$inferSelect;
export type McpToolPermission = typeof mcpToolPermissions.$inferSelect;
export type McpToolAuditEntry = typeof mcpToolAuditLog.$inferSelect;

// Insert (write) types
export type NewMcpServer = typeof mcpServers.$inferInsert;
export type NewMcpToolPermission = typeof mcpToolPermissions.$inferInsert;
export type NewMcpToolAuditEntry = typeof mcpToolAuditLog.$inferInsert;
```

## Migration Steps

### 1. Run Drizzle Push
```bash
npx drizzle-kit push
```

This will:
- Create the three new tables
- Create all indexes
- Set up foreign key constraints
- No data migration needed (new feature)

### 2. Verify Migration
```bash
# Check table creation
npx drizzle-kit check

# Optionally verify in database
psql $DATABASE_URL -c "\d mcp_servers"
psql $DATABASE_URL -c "\d mcp_tool_permissions"
psql $DATABASE_URL -c "\d mcp_tool_audit_log"
```

## Usage Examples

### Creating an MCP Server Configuration

```typescript
import { db } from '@/lib/db';
import { mcpServers, NewMcpServer } from '@/lib/db/schema';

// stdio transport example
const stdioServer: NewMcpServer = {
  userId: 'user-123',
  name: 'GitHub MCP Server',
  description: 'Access GitHub repositories and issues',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: {
    GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xxx'
  },
  enabled: true
};

await db.insert(mcpServers).values(stdioServer);

// HTTP transport example
const httpServer: NewMcpServer = {
  userId: 'user-123',
  name: 'Custom API Server',
  description: 'Custom MCP server via HTTP',
  transport: 'http',
  url: 'https://api.example.com/mcp',
  headers: {
    'Authorization': 'Bearer xxx',
    'X-Custom-Header': 'value'
  },
  enabled: true
};

await db.insert(mcpServers).values(httpServer);
```

### Setting Tool Permissions

```typescript
import { mcpToolPermissions, NewMcpToolPermission } from '@/lib/db/schema';

const permission: NewMcpToolPermission = {
  userId: 'user-123',
  serverId: 'server-456',
  toolName: 'get_file_contents',
  alwaysAllow: true // Skip approval prompt
};

await db.insert(mcpToolPermissions).values(permission);
```

### Logging Tool Execution

```typescript
import { mcpToolAuditLog, NewMcpToolAuditEntry } from '@/lib/db/schema';

const auditEntry: NewMcpToolAuditEntry = {
  userId: 'user-123',
  serverId: 'server-456',
  toolName: 'create_repository',
  arguments: {
    name: 'my-new-repo',
    private: true
  },
  result: {
    id: 'repo-789',
    url: 'https://github.com/user/my-new-repo'
  },
  duration: 1234 // milliseconds
};

await db.insert(mcpToolAuditLog).values(auditEntry);
```

### Querying MCP Servers

```typescript
import { db } from '@/lib/db';
import { mcpServers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// Get all enabled servers for a user
const userServers = await db
  .select()
  .from(mcpServers)
  .where(
    and(
      eq(mcpServers.userId, 'user-123'),
      eq(mcpServers.enabled, true)
    )
  );

// Get server by ID
const server = await db
  .select()
  .from(mcpServers)
  .where(eq(mcpServers.id, 'server-456'))
  .limit(1);
```

### Checking Tool Permissions

```typescript
import { db } from '@/lib/db';
import { mcpToolPermissions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

async function isToolAlwaysAllowed(
  userId: string,
  serverId: string,
  toolName: string
): Promise<boolean> {
  const permission = await db
    .select()
    .from(mcpToolPermissions)
    .where(
      and(
        eq(mcpToolPermissions.userId, userId),
        eq(mcpToolPermissions.serverId, serverId),
        eq(mcpToolPermissions.toolName, toolName),
        eq(mcpToolPermissions.alwaysAllow, true)
      )
    )
    .limit(1);

  return permission.length > 0;
}
```

### Audit Log Queries

```typescript
import { db } from '@/lib/db';
import { mcpToolAuditLog } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

// Get recent tool executions for a user
const recentExecutions = await db
  .select()
  .from(mcpToolAuditLog)
  .where(eq(mcpToolAuditLog.userId, 'user-123'))
  .orderBy(desc(mcpToolAuditLog.createdAt))
  .limit(50);

// Get failed executions
const failures = await db
  .select()
  .from(mcpToolAuditLog)
  .where(sql`${mcpToolAuditLog.error} IS NOT NULL`)
  .orderBy(desc(mcpToolAuditLog.createdAt));

// Get execution statistics
const stats = await db
  .select({
    serverId: mcpToolAuditLog.serverId,
    toolName: mcpToolAuditLog.toolName,
    totalCalls: sql<number>`count(*)`,
    avgDuration: sql<number>`avg(${mcpToolAuditLog.duration})`,
    failureRate: sql<number>`
      sum(case when ${mcpToolAuditLog.error} is not null then 1 else 0 end)::float / count(*)
    `
  })
  .from(mcpToolAuditLog)
  .where(eq(mcpToolAuditLog.userId, 'user-123'))
  .groupBy(mcpToolAuditLog.serverId, mcpToolAuditLog.toolName);
```

## Design Decisions

### Why `text` for IDs instead of `uuid`?
Follows existing pattern in schema (see `users`, `sessions`, `accounts`, `verifications` tables) for Better Auth compatibility. Uses `crypto.randomUUID()` via `$defaultFn()`.

### Why no FK on `mcpToolAuditLog.serverId`?
Preserves historical audit data even if a server configuration is deleted. Allows administrators to see what tools were used historically.

### Why separate `mcp_tool_permissions` table?
- Enables fine-grained control per tool
- Reduces JSONB querying complexity
- Allows indexing for fast permission checks
- Supports future features like per-tool quotas or rate limits

### Why store both `arguments` and `result` in audit log?
- **arguments**: Enables debugging failed executions
- **result**: Provides full observability of tool outputs
- **Both**: Allows replaying or rolling back operations in the future

## Security Considerations

1. **Environment Variables in `mcpServers.env`**: Contains sensitive tokens. Ensure proper row-level security or encryption at rest.

2. **Audit Log Retention**: Consider implementing TTL or archival for `mcpToolAuditLog` to manage database size.

3. **Permission Model**: `alwaysAllow` bypasses approval prompts. Ensure UI clearly communicates security implications.

4. **Server Validation**: Validate server configurations before enabling to prevent malicious command injection via `stdio` transport.

## Future Enhancements

1. **Server Templates**: Pre-configured servers users can enable with one click
2. **Tool Quotas**: Rate limiting and usage quotas per tool
3. **Shared Servers**: Organization-level MCP servers (add `organizationId` FK)
4. **Server Health Checks**: Track server availability and response times
5. **Tool Metadata Cache**: Cache tool schemas to reduce server round-trips

## Related POCs

- **POC-7**: MCP Client Implementation
- **POC-4**: Proxy Authorization (similar permission model)
- **POC-6**: Chat Sessions (audit logging patterns)

---

**Schema Version**: 1.0
**Date**: 2026-01-18
**Author**: AI Assistant (Claude)
**Status**: ✅ Ready for Migration
