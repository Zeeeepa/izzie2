/**
 * Example: Testing MCP Integration with Chat API
 *
 * This example demonstrates how to:
 * 1. Connect to an MCP server
 * 2. Verify tools are available
 * 3. Send a chat message that triggers tool usage
 */

import { getMCPClientManager } from '@/lib/mcp';

async function testMCPChatIntegration() {
  console.log('🚀 Testing MCP Chat Integration\n');

  // Step 1: Get MCP Client Manager
  const mcpManager = getMCPClientManager();

  // Step 2: Connect to an MCP server (example: filesystem server)
  console.log('📡 Connecting to MCP server...');

  const serverConfig = {
    id: 'filesystem',
    userId: 'test-user',
    name: 'Filesystem Server',
    description: 'Access local filesystem',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    const status = await mcpManager.connect(serverConfig);

    if (status.connected) {
      console.log(`✅ Connected to ${serverConfig.name}`);
      console.log(`📋 Available tools: ${status.tools.length}`);

      status.tools.forEach(tool => {
        console.log(`   - ${tool.name}: ${tool.description}`);
      });
    } else {
      console.error(`❌ Failed to connect: ${status.error}`);
      return;
    }
  } catch (error) {
    console.error('❌ Connection error:', error);
    return;
  }

  // Step 3: Verify tools are available to chat API
  console.log('\n🔍 Checking tools available for chat...');
  const allTools = mcpManager.getAllTools();
  console.log(`✅ ${allTools.length} tools available globally`);

  // Step 4: Simulate a chat request
  console.log('\n💬 Simulating chat request...');
  console.log('User message: "Can you list the files in the /tmp directory?"');
  console.log('\nExpected behavior:');
  console.log('1. AI receives filesystem tools in context');
  console.log('2. AI decides to call filesystem__list_directory tool');
  console.log('3. Tool executes and returns file list');
  console.log('4. AI formats response with file information');

  // Step 5: Test tool execution directly
  console.log('\n🔧 Testing direct tool execution...');
  try {
    const result = await mcpManager.executeTool(
      'filesystem',
      'list_directory',
      { path: '/tmp' }
    );
    console.log('✅ Tool execution result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Tool execution failed:', error);
  }

  // Cleanup
  console.log('\n🧹 Disconnecting...');
  await mcpManager.disconnect('filesystem');
  console.log('✅ Test complete!');
}

// Alternative: Test with a simpler echo server
async function testWithEchoServer() {
  console.log('🚀 Testing with Echo Server\n');

  const mcpManager = getMCPClientManager();

  const serverConfig = {
    id: 'echo',
    userId: 'test-user',
    name: 'Echo Server',
    description: 'Simple echo server for testing',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-echo'],
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const status = await mcpManager.connect(serverConfig);

  if (status.connected) {
    console.log('✅ Connected to echo server');
    console.log('📋 Tools:', status.tools.map(t => t.name).join(', '));

    // Test tool execution
    const result = await mcpManager.executeTool(
      'echo',
      'echo',
      { message: 'Hello from MCP!' }
    );
    console.log('📤 Echo result:', result);
  }

  await mcpManager.disconnect('echo');
}

// Example: Connecting to multiple servers
async function testMultipleServers() {
  const mcpManager = getMCPClientManager();

  const servers = [
    {
      id: 'filesystem',
      name: 'Filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    },
    {
      id: 'time',
      name: 'Time Server',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-time'],
    },
  ];

  console.log('🚀 Connecting to multiple MCP servers...\n');

  for (const server of servers) {
    const config = {
      id: server.id,
      userId: 'test-user',
      name: server.name,
      transport: 'stdio' as const,
      command: server.command,
      args: server.args,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const status = await mcpManager.connect(config);
    console.log(`${status.connected ? '✅' : '❌'} ${server.name}: ${status.tools.length} tools`);
  }

  // Show all available tools
  console.log('\n📋 All available tools:');
  const allTools = mcpManager.getAllTools();
  allTools.forEach(tool => {
    console.log(`   ${tool.serverName}::${tool.name} - ${tool.description}`);
  });

  // Cleanup
  for (const server of servers) {
    await mcpManager.disconnect(server.id);
  }
}

// Run tests
if (require.main === module) {
  testMCPChatIntegration()
    .then(() => console.log('\n✨ All tests complete'))
    .catch(err => console.error('❌ Test failed:', err));
}

export {
  testMCPChatIntegration,
  testWithEchoServer,
  testMultipleServers,
};
