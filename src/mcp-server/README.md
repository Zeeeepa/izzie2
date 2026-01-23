# Izzie MCP Server

Exposes Izzie's capabilities via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), allowing external Claude instances (Claude Desktop, Claude Code, etc.) to use Izzie's tools.

## Available Tools

### Email Tools (Gmail)
- `archive_email` - Archive emails by search query
- `send_email` - Send an email (requires confirmation)
- `create_draft` - Create an email draft
- `list_labels` - List Gmail labels
- `bulk_archive` - Archive multiple emails matching criteria

### Task Tools (Google Tasks)
- `create_task` - Create a new task
- `complete_task` - Mark a task as complete
- `list_tasks` - List tasks from task lists
- `create_task_list` - Create a new task list
- `list_task_lists` - List all task lists

### GitHub Tools
- `list_github_issues` - List issues from a repository
- `create_github_issue` - Create a new issue
- `update_github_issue` - Update an existing issue
- `add_github_comment` - Add a comment to an issue

## Prerequisites

1. **Izzie must be running** with a valid database connection
2. **User must be authenticated** in Izzie with:
   - Google OAuth (for email and tasks)
   - GitHub OAuth (for GitHub tools)
3. **User ID** from Izzie's database

## Getting Your User ID

1. Log into Izzie in your browser
2. Open browser DevTools (F12)
3. Go to Application > Cookies
4. Find the session cookie and decode the user ID
5. Or check the database `users` table directly

## Configuration

### Claude Desktop

Add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "izzie": {
      "command": "npx",
      "args": ["tsx", "/path/to/izzie2/src/mcp-server/index.ts"],
      "env": {
        "IZZIE_USER_ID": "your-user-id-here",
        "DATABASE_URL": "postgresql://...",
        "GOOGLE_CLIENT_ID": "...",
        "GOOGLE_CLIENT_SECRET": "..."
      }
    }
  }
}
```

### Claude Code

Add to your project's `.mcp.json` or global MCP config:

```json
{
  "servers": {
    "izzie": {
      "command": "npx",
      "args": ["tsx", "/path/to/izzie2/src/mcp-server/index.ts"],
      "env": {
        "IZZIE_USER_ID": "your-user-id-here",
        "DATABASE_URL": "postgresql://...",
        "GOOGLE_CLIENT_ID": "...",
        "GOOGLE_CLIENT_SECRET": "..."
      }
    }
  }
}
```

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `IZZIE_USER_ID` | Your user ID from Izzie's database |
| `DATABASE_URL` | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID (for GitHub tools) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret (for GitHub tools) |

## Running Manually

```bash
# From the izzie2 directory
cd /path/to/izzie2

# Set required environment variables
export IZZIE_USER_ID="your-user-id"
export DATABASE_URL="postgresql://..."
# ... other env vars

# Run the MCP server
pnpm run mcp-server

# Or directly with tsx
npx tsx src/mcp-server/index.ts
```

## Usage Examples

Once configured, you can ask Claude to:

### Email
- "Archive all newsletters from the past week"
- "Send an email to john@example.com about the meeting"
- "Create a draft reply to the latest email from my boss"

### Tasks
- "Create a task to review the quarterly report"
- "Show me my pending tasks"
- "Mark the 'Buy groceries' task as complete"

### GitHub
- "List open issues in my project"
- "Create an issue for the login bug"
- "Add a comment to issue #42"

## Troubleshooting

### "IZZIE_USER_ID environment variable is required"

Make sure you've set the `IZZIE_USER_ID` in your config's `env` section.

### "No Google tokens found for user"

The user hasn't connected their Google account in Izzie. Log into Izzie web UI and connect Google OAuth.

### "No GitHub account linked to this user"

The user hasn't connected their GitHub account in Izzie. Log into Izzie web UI and connect GitHub OAuth.

### Connection errors

1. Check that Izzie's database is accessible
2. Verify all required environment variables are set
3. Check the MCP server logs for detailed error messages

## Architecture

```
Claude Desktop/Code
        |
        | (MCP over stdio)
        v
  Izzie MCP Server
        |
        | (Izzie chat tools)
        v
  Izzie Services
   (Gmail, Tasks, GitHub)
        |
        | (OAuth tokens from DB)
        v
   External APIs
```

The MCP server:
1. Receives tool calls from Claude via stdio
2. Looks up OAuth tokens for the configured user
3. Executes the tool using Izzie's existing chat tool infrastructure
4. Returns results back to Claude

## Security Notes

- The MCP server runs with the permissions of the configured user
- OAuth tokens are fetched from Izzie's database
- Never share your `IZZIE_USER_ID` or expose the MCP server publicly
- The server only accepts connections via stdio (no network exposure)
