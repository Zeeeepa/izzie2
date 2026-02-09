/**
 * MCP Tools Registry
 * Converts Izzie chat tools to MCP tool format and provides execution wrappers
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpAuthContext } from './auth.js';

// Import tool schemas and executors from chat tools
import {
  archiveEmailTool,
  archiveEmailToolSchema,
  sendEmailTool,
  sendEmailToolSchema,
  createDraftTool,
  createDraftToolSchema,
  listLabelsTool,
  listLabelsToolSchema,
  bulkArchiveTool,
  bulkArchiveToolSchema,
} from '../lib/chat/tools/email.js';

import {
  createTaskTool,
  createTaskToolSchema,
  completeTaskTool,
  completeTaskToolSchema,
  listTasksTool,
  listTasksToolSchema,
  createTaskListTool,
  createTaskListToolSchema,
  listTaskListsTool,
  listTaskListsToolSchema,
} from '../lib/chat/tools/tasks.js';

import {
  listGithubIssuesTool,
  listGithubIssuesToolSchema,
  createGithubIssueTool,
  createGithubIssueToolSchema,
  updateGithubIssueTool,
  updateGithubIssueToolSchema,
  addGithubCommentTool,
  addGithubCommentToolSchema,
} from '../lib/chat/tools/github.js';

/**
 * Tool definition for MCP registration
 */
interface McpToolDefinition {
  name: string;
  description: string;
  schema: z.ZodType<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (params: any, userId: string) => Promise<{ message: string } | unknown>;
}

/**
 * All tools available for MCP exposure
 */
const mcpTools: McpToolDefinition[] = [
  // Email tools
  {
    name: 'archive_email',
    description: archiveEmailTool.description,
    schema: archiveEmailToolSchema,
    execute: archiveEmailTool.execute,
  },
  {
    name: 'send_email',
    description: sendEmailTool.description,
    schema: sendEmailToolSchema,
    execute: sendEmailTool.execute,
  },
  {
    name: 'create_draft',
    description: createDraftTool.description,
    schema: createDraftToolSchema,
    execute: createDraftTool.execute,
  },
  {
    name: 'list_labels',
    description: listLabelsTool.description,
    schema: listLabelsToolSchema,
    execute: listLabelsTool.execute,
  },
  {
    name: 'bulk_archive',
    description: bulkArchiveTool.description,
    schema: bulkArchiveToolSchema,
    execute: bulkArchiveTool.execute,
  },

  // Task tools
  {
    name: 'create_task',
    description: createTaskTool.description,
    schema: createTaskToolSchema,
    execute: createTaskTool.execute,
  },
  {
    name: 'complete_task',
    description: completeTaskTool.description,
    schema: completeTaskToolSchema,
    execute: completeTaskTool.execute,
  },
  {
    name: 'list_tasks',
    description: listTasksTool.description,
    schema: listTasksToolSchema,
    execute: listTasksTool.execute,
  },
  {
    name: 'create_task_list',
    description: createTaskListTool.description,
    schema: createTaskListToolSchema,
    execute: createTaskListTool.execute,
  },
  {
    name: 'list_task_lists',
    description: listTaskListsTool.description,
    schema: listTaskListsToolSchema,
    execute: listTaskListsTool.execute,
  },

  // GitHub tools
  {
    name: 'list_github_issues',
    description: listGithubIssuesTool.description,
    schema: listGithubIssuesToolSchema,
    execute: listGithubIssuesTool.execute,
  },
  {
    name: 'create_github_issue',
    description: createGithubIssueTool.description,
    schema: createGithubIssueToolSchema,
    execute: createGithubIssueTool.execute,
  },
  {
    name: 'update_github_issue',
    description: updateGithubIssueTool.description,
    schema: updateGithubIssueToolSchema,
    execute: updateGithubIssueTool.execute,
  },
  {
    name: 'add_github_comment',
    description: addGithubCommentTool.description,
    schema: addGithubCommentToolSchema,
    execute: addGithubCommentTool.execute,
  },
];

/**
 * Convert Zod schema to JSON Schema format for MCP
 * Uses Zod 4's built-in toJSONSchema() method
 */
function zodToJsonSchemaShape(schema: z.ZodType<unknown>): Record<string, unknown> {
  // Zod 4 has built-in JSON Schema conversion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonSchema = (schema as any).toJSONSchema();

  // Return the schema object for MCP to use
  if (typeof jsonSchema === 'object' && jsonSchema !== null) {
    return jsonSchema as Record<string, unknown>;
  }

  return {};
}

/**
 * Register all Izzie tools with an MCP server instance
 *
 * @param server - MCP server instance to register tools with
 * @param authContext - Authentication context for tool execution
 */
export function registerMcpTools(server: McpServer, authContext: McpAuthContext): void {
  const LOG_PREFIX = '[MCP Tools]';

  for (const tool of mcpTools) {
    // Get the JSON schema for the tool parameters
    const jsonSchema = zodToJsonSchemaShape(tool.schema);

    // Extract properties and required fields from the JSON schema
    const properties = (jsonSchema.properties as Record<string, unknown>) || {};
    const required = (jsonSchema.required as string[]) || [];

    // Build the input schema shape for MCP's registerTool
    // MCP expects a Zod-like shape, so we'll pass the original schema
    const inputShape = buildZodShapeFromSchema(tool.schema);

    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: inputShape,
      },
      async (args) => {
        try {
          console.error(`${LOG_PREFIX} Executing tool: ${tool.name}`);

          // Validate and parse arguments with the Zod schema
          const validatedArgs = tool.schema.parse(args);

          // Execute the tool with the authenticated user context
          const result = await tool.execute(validatedArgs, authContext.userId);

          // Format result for MCP
          const resultMessage =
            typeof result === 'object' && result !== null && 'message' in result
              ? (result as { message: string }).message
              : JSON.stringify(result);

          console.error(`${LOG_PREFIX} Tool ${tool.name} completed successfully`);

          return {
            content: [
              {
                type: 'text' as const,
                text: resultMessage,
              },
            ],
          };
        } catch (error) {
          console.error(`${LOG_PREFIX} Tool ${tool.name} failed:`, error);

          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    console.error(`${LOG_PREFIX} Registered tool: ${tool.name}`);
  }

  console.error(`${LOG_PREFIX} Registered ${mcpTools.length} tools`);
}

/**
 * Build a Zod-compatible shape from a Zod schema
 * This extracts the shape for MCP's registerTool which expects Zod shapes
 */
function buildZodShapeFromSchema(schema: z.ZodType<unknown>): Record<string, z.ZodType<unknown>> {
  // Check if this is a ZodObject
  if (schema instanceof z.ZodObject) {
    return schema.shape;
  }

  // For other schema types, wrap in an object
  return {};
}

/**
 * Get the list of available tool names
 */
export function getToolNames(): string[] {
  return mcpTools.map((tool) => tool.name);
}
