# MCP Client Infrastructure

This directory contains the MCP (Model Context Protocol) client infrastructure for Izzie, enabling connections to external MCP servers.

## Overview

The MCP client allows Izzie to:
- Connect to external MCP servers (stdio and SSE transports)
- Discover available tools and resources
- Execute tools with proper error handling
- Manage server connections and status

## Files

- `types.ts` - TypeScript type definitions for MCP entities
- `client.ts` - MCP client manager implementation
- `index.ts` - Public API exports

## Usage

### Basic Setup

```typescript
import { getMCPClientManager, MCPServerConfig } from '@/lib/mcp';

const manager = getMCPClientManager();
```

### Connecting to an MCP Server (stdio)

```typescript
const config: MCPServerConfig = {
  id: 'filesystem-server',
  userId: 'user-123',
  name: 'Filesystem Server',
  description: 'Access local filesystem',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
  env: {},
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const status = await manager.connect(config);
console.log(`Connected: ${status.connected}`);
console.log(`Tools available: ${status.tools.length}`);
```

### Connecting to an MCP Server (SSE)

```typescript
const config: MCPServerConfig = {
  id: 'remote-server',
  userId: 'user-123',
  name: 'Remote MCP Server',
  transport: 'sse',
  url: 'https://example.com/mcp',
  headers: {
    'Authorization': 'Bearer token',
  },
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const status = await manager.connect(config);
```

### Executing Tools

```typescript
const result = await manager.executeTool(
  'filesystem-server',
  'read_file',
  { path: '/path/to/file.txt' }
);

console.log(result);
```

### Reading Resources

```typescript
const resource = await manager.readResource(
  'filesystem-server',
  'file:///path/to/file.txt'
);

console.log(resource);
```

### Listing Available Tools

```typescript
// Get all tools from all connected servers
const allTools = manager.getAllTools();

allTools.forEach(tool => {
  console.log(`${tool.name} (from ${tool.serverName})`);
  console.log(`  Description: ${tool.description}`);
  console.log(`  Input Schema:`, tool.inputSchema);
});
```

### Checking Server Status

```typescript
// Get status of all servers
const statuses = manager.getAllStatuses();

statuses.forEach(status => {
  console.log(`Server: ${status.serverId}`);
  console.log(`Connected: ${status.connected}`);
  console.log(`Tools: ${status.tools.length}`);
  console.log(`Resources: ${status.resources.length}`);
});

// Get status of a specific server
const serverStatus = manager.getStatus('filesystem-server');
if (serverStatus?.connected) {
  console.log('Server is connected');
}
```

### Disconnecting

```typescript
await manager.disconnect('filesystem-server');
```

## Architecture

### MCPClientManager

The `MCPClientManager` class is the main interface for MCP operations:

- **Singleton Pattern**: Use `getMCPClientManager()` to get the shared instance
- **Connection Management**: Handles connecting/disconnecting from servers
- **Tool Discovery**: Automatically discovers tools when connecting
- **Resource Discovery**: Automatically discovers resources when connecting
- **Error Handling**: Captures connection errors and reports them in server status

### Transport Types

- **stdio**: Spawns a local process and communicates via stdin/stdout
  - Best for: Local CLI tools, file system access, local databases
  - Requires: `command` and optional `args`, `env`

- **sse**: Connects to a remote server via Server-Sent Events
  - Best for: Remote services, cloud-based tools
  - Requires: `url` and optional `headers`

## Error Handling

The client manager handles errors gracefully:

```typescript
const status = await manager.connect(config);

if (!status.connected) {
  console.error(`Failed to connect: ${status.error}`);
  // Server status still tracked with error information
}
```

Tool execution errors are propagated:

```typescript
try {
  const result = await manager.executeTool(serverId, toolName, args);
} catch (error) {
  console.error('Tool execution failed:', error);
}
```

## Integration with Izzie

The MCP client infrastructure will integrate with:

1. **Chat System**: Tools available to AI assistant during conversations
2. **Dashboard**: UI for managing MCP server connections
3. **Database**: Persist server configurations and tool permissions
4. **Authentication**: Associate servers with user accounts

## Next Steps

1. Create database schema for server configurations
2. Build API endpoints for server management (CRUD)
3. Add UI for configuring MCP servers
4. Implement tool permission system
5. Integrate tools into chat context
6. Add server health monitoring

## References

- [MCP Specification](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Available MCP Servers](https://github.com/modelcontextprotocol/servers)
