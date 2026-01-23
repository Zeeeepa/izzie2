/**
 * MCP Server Authentication
 * Handles user authentication context for MCP tool executions
 */

/**
 * MCP Authentication Context
 * Provides authenticated user context for tool execution
 */
export interface McpAuthContext {
  userId: string;
}

/**
 * Get authentication context from environment variables
 * In MCP server mode, user credentials are passed via environment
 *
 * @returns Authentication context with user ID
 * @throws Error if IZZIE_USER_ID is not set
 */
export function getAuthContext(): McpAuthContext {
  const userId = process.env.IZZIE_USER_ID;

  if (!userId) {
    throw new Error(
      'IZZIE_USER_ID environment variable is required. ' +
        'Set it in your Claude Desktop config or export it before running the MCP server.'
    );
  }

  return { userId };
}

/**
 * Validate authentication context
 * Ensures the user ID is properly formatted
 *
 * @param context - Authentication context to validate
 * @returns true if valid
 * @throws Error if invalid
 */
export function validateAuthContext(context: McpAuthContext): boolean {
  if (!context.userId || typeof context.userId !== 'string') {
    throw new Error('Invalid user ID in authentication context');
  }

  if (context.userId.length < 1) {
    throw new Error('User ID cannot be empty');
  }

  return true;
}
