# Izzie User Guide

Welcome to Izzie, your AI-powered personal assistant that connects to your Gmail, Calendar, Tasks, GitHub, and Contacts. This guide will help you get started and make the most of all features.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Chat](#chat)
3. [Entities](#entities)
4. [Relationships](#relationships)
5. [Train](#train)
6. [Calendar](#calendar)
7. [Settings](#settings)
8. [Telegram Bot](#telegram-bot)
9. [MCP Server for Claude Desktop](#mcp-server-for-claude-desktop)

---

## Getting Started

### First-Time Setup

When you first use Izzie, you'll go through a simple onboarding process:

1. **Sign In** - Use your Google account to sign in
2. **Connect Services** - Grant Izzie access to Gmail, Calendar, Tasks, and Contacts
3. **Optional: Connect GitHub** - Link your GitHub account for issue management
4. **Optional: Link Telegram** - Connect Telegram for mobile notifications and chat

### Navigation

Izzie uses a mobile-first design with bottom navigation:

- **Chat** - Your main AI assistant interface
- **Entities** - Browse extracted people, companies, projects, and more
- **Relationships** - View the knowledge graph connecting your entities
- **Train** - Help Izzie learn from your feedback

Access additional features through **Settings** in the header.

---

## Chat

The Chat interface is your primary way to interact with Izzie. Ask questions naturally and Izzie will help you using connected tools.

### What You Can Do

#### Email Management
- "Show me unread emails from John"
- "Archive all newsletters from last week"
- "Send an email to sarah@example.com about the project update"
- "Create a draft reply to the meeting request"
- "Move this email to the Work folder"
- "Create a filter to auto-archive emails from promotions@"

#### Task Management
- "What tasks do I have due this week?"
- "Create a task to review the quarterly report by Friday"
- "Mark the budget review task as complete"
- "Show me my task lists"
- "Create a new task list called Personal Projects"

#### Calendar
- "What's on my calendar today?"
- "Show me tomorrow's meetings"
- "What events do I have this week?"

#### GitHub Issues
- "Show me open issues in myorg/myrepo"
- "Create a new issue for the login bug"
- "Close issue #42 with a comment"
- "What issues are assigned to me?"

#### Contacts
- "Find contact info for John Smith"
- "Who works at Acme Corp?"
- "Show me Sarah's phone number"

#### Research
- "Research the latest AI developments in healthcare"
- "What have I discussed with John in emails?"
- "Find information about our Q4 project in my Drive"

### Available Tools

Izzie has access to these tools:

| Tool | Description |
|------|-------------|
| `research` | Comprehensive research across web, email, and Google Drive |
| `create_task` | Create a new task in Google Tasks |
| `complete_task` | Mark a task as completed |
| `list_tasks` | View your tasks |
| `create_task_list` | Create a new task list |
| `list_task_lists` | View all task lists |
| `delete_task_list` | Remove a task list |
| `rename_task_list` | Rename an existing task list |
| `archive_email` | Archive an email |
| `delete_email` | Delete an email |
| `apply_label` | Apply a label to emails |
| `list_labels` | View available Gmail labels |
| `send_email` | Compose and send an email |
| `bulk_archive` | Archive multiple emails at once |
| `create_draft` | Create an email draft |
| `move_email` | Move email to a different folder |
| `create_email_filter` | Create Gmail filters |
| `list_email_filters` | View existing filters |
| `delete_email_filter` | Remove a filter |
| `list_github_issues` | List issues from a repository |
| `create_github_issue` | Create a new GitHub issue |
| `update_github_issue` | Modify an existing issue |
| `add_github_comment` | Comment on an issue |
| `search_contacts` | Search your Google Contacts |
| `get_contact_details` | Get detailed contact info |
| `sync_contacts` | Synchronize contacts |

### Memory and Context

Izzie maintains context throughout your conversation and remembers important information from previous interactions. This helps provide more personalized and relevant responses over time.

---

## Entities

The Entities page displays people, companies, projects, and other items extracted from your emails and calendar.

### Entity Types

- **Person** - People mentioned in your communications
- **Company** - Organizations and businesses
- **Project** - Projects you're working on
- **Topic** - Subjects and themes
- **Location** - Places and addresses
- **Action Item** - Tasks mentioned in emails
- **Date** - Important dates
- **URL** - Links and references
- **Time** - Time references

### Browsing Entities

1. **Filter by Type** - Click the type cards at the top to filter
2. **Search** - Use the search box to find specific entities
3. **View Details** - Click any entity card to see more information

### Understanding Confidence Scores

Each entity has a confidence score (0-100%) indicating how certain Izzie is about the extraction:

- **High (80%+)** - Very confident, likely accurate
- **Medium (60-79%)** - Reasonably confident
- **Low (<60%)** - Less certain, may need verification

### Data Storage

Entities are stored in Weaviate, a vector database that enables semantic search and intelligent matching. This allows Izzie to find related entities even when exact names don't match.

---

## Relationships

The Relationships page shows how entities connect to each other in an interactive graph visualization.

### Relationship Types

**Professional Relationships** (blue solid lines)
- WORKS_WITH - Colleagues who work together
- WORKS_FOR - Employment relationship
- REPORTS_TO - Reporting structure
- LEADS - Leadership role
- WORKS_ON - Project involvement
- EXPERT_IN - Subject expertise

**Business Relationships** (green solid lines)
- PARTNERS_WITH - Business partnerships
- COMPETES_WITH - Competitive relationship
- OWNS - Ownership

**Structural Relationships** (gray dashed lines)
- RELATED_TO - General association
- DEPENDS_ON - Dependency
- PART_OF - Component relationship
- SUBTOPIC_OF - Topic hierarchy
- ASSOCIATED_WITH - General connection

**Geographic Relationships** (purple dotted lines)
- LOCATED_IN - Physical location

**Personal Relationships** (pink solid lines)
- FRIEND_OF - Friendship
- FAMILY_OF - Family relationship
- MARRIED_TO - Spousal relationship
- SIBLING_OF - Sibling relationship

### Using the Graph

1. **Pan and Zoom** - Click and drag to pan, scroll to zoom
2. **Select Nodes** - Click entities to see their details
3. **Select Edges** - Click relationship lines to see connection details
4. **Filter** - Use dropdowns to filter by entity or relationship type
5. **Search** - Find specific entities in the graph

### Actions

- **Refresh Relationships** - Re-analyze entities to discover new connections
- **Catch-up** - Extract relationships from recent emails (last 7/30/90 days)
- **Clear All** - Remove all relationships and start fresh

---

## Train

The Train page lets you improve Izzie's accuracy through human feedback.

### How It Works

1. **Select Sample Size** - Choose how many items to review (50, 100, 250, or 500)
2. **Set Budget** - Control API costs ($5, $10, $25, or $50)
3. **Choose Training Mode**
   - **Collect Feedback** - Review predictions one by one
   - **Auto-Train** - Let Izzie learn from high-confidence predictions
4. **Select Sample Types** - Entity, Relationship, or Classification

### Providing Feedback

When reviewing predictions:

1. **View the Sample** - See the text and context
2. **Check the Prediction** - See what Izzie predicted and its confidence
3. **Mark Correct** - Click thumbs up if the prediction is right
4. **Mark Incorrect** - Click thumbs down and optionally provide the correct answer
5. **Skip** - Skip unclear samples

### Exception Queue

Low-confidence or unusual predictions appear in the Exception Queue. Review these carefully as they often represent edge cases that help Izzie learn.

### Progress Tracking

Monitor your training session with:

- **Budget Meter** - See remaining API budget
- **Progress** - Track reviewed vs. pending samples
- **Accuracy** - Watch Izzie's accuracy improve

### Exporting Training Data

Training data can be exported in OpenAI or Anthropic fine-tuning formats for advanced users who want to train custom models.

---

## Calendar

The Calendar page shows your Google Calendar events.

### Features

- View today's schedule
- Browse upcoming events
- See event details including location and attendees
- Quick overview of your day

### Integration

Calendar data is also available through the Chat interface. Ask Izzie questions like:
- "What meetings do I have today?"
- "When is my next appointment?"
- "Show me this week's calendar"

---

## Settings

Access Settings from the header to manage your account and preferences.

### Connected Accounts

**Google Account**
- View connected Google services
- Re-authorize if permissions change
- Manage Gmail, Calendar, Tasks, and Contacts access

**GitHub Account**
- Connect or disconnect GitHub
- Required for GitHub issue management features

### Telegram

Link your Telegram account to:
- Receive notifications on mobile
- Chat with Izzie from Telegram
- Get alerts for important emails

**To link Telegram:**
1. Go to Settings > Telegram
2. Click "Link Telegram"
3. Copy the generated code
4. Send the code to the Izzie Telegram bot
5. Your accounts will be linked automatically

### MCP Server

Configure MCP (Model Context Protocol) servers to extend Izzie's capabilities.

**API Keys**
- Create API keys for Claude Desktop or claude-mpm integration
- Manage key expiration and permissions
- Revoke keys when no longer needed

**MCP Servers**
- Add external tool servers
- Supports stdio, SSE, and HTTP transports
- Connect, disconnect, and manage servers

### Sign Out

Sign out of your account from the Settings page.

---

## Telegram Bot

Use Izzie from anywhere with the Telegram bot.

### Setup

1. Find the Izzie bot on Telegram (provided by your administrator)
2. Start a conversation with `/start`
3. Link your account using the code from Settings > Telegram

### Commands

- Send any message to chat with Izzie
- Receive notifications for important emails
- Get calendar reminders
- Manage tasks on the go

### Mobile vs. Desktop

Telegram is optimized for quick interactions:
- Short questions and answers
- Task creation and management
- Quick email actions

For complex research or graph exploration, use the desktop web interface.

---

## MCP Server for Claude Desktop

Izzie includes an MCP server that lets you use Izzie's capabilities directly in Claude Desktop.

### What is MCP?

Model Context Protocol (MCP) allows AI assistants like Claude Desktop to connect to external tools and services. Izzie's MCP server exposes all of Izzie's tools to Claude.

### Setup

1. **Generate an API Key**
   - Go to Settings > MCP
   - Click "Create API Key"
   - Give it a name like "Claude Desktop"
   - Copy the key (you won't see it again)

2. **Configure Claude Desktop**
   Add the Izzie MCP server to your Claude Desktop configuration:
   ```json
   {
     "mcpServers": {
       "izzie": {
         "url": "https://your-izzie-instance.com/api/mcp",
         "headers": {
           "Authorization": "Bearer YOUR_API_KEY"
         }
       }
     }
   }
   ```

3. **Use Izzie Tools in Claude**
   Once connected, ask Claude to:
   - "Use Izzie to check my email"
   - "Create a task with Izzie"
   - "Search my contacts using Izzie"

### Security

- API keys are scoped to your account
- Keys can be revoked at any time
- Set expiration dates for extra security

---

## Tips and Best Practices

### Getting Better Results

1. **Be Specific** - "Show emails from John about the Q4 budget" works better than "Find emails"
2. **Use Natural Language** - Izzie understands conversational requests
3. **Provide Context** - Mention project names, dates, or people for better results

### Keyboard Shortcuts

- **Enter** - Send message in chat
- **Shift+Enter** - New line in chat

### Troubleshooting

**Izzie says it can't access my email**
- Check Settings > Connected Accounts
- Re-authorize Google if needed

**Tasks aren't syncing**
- Ensure Tasks access is granted
- Check that you have task lists in Google Tasks

**GitHub features not working**
- Connect your GitHub account in Settings
- Make sure you have access to the repository

### Privacy and Security

- Izzie only accesses data you explicitly authorize
- No data is stored permanently without your knowledge
- You can revoke access at any time in Settings

---

## Support

Having issues? Here are some options:

1. **Check the FAQ** - Common questions are answered above
2. **Refresh the Page** - Sometimes a simple refresh helps
3. **Re-authorize Services** - If features stop working, try reconnecting in Settings
4. **Contact Support** - Reach out to your administrator

---

*Last updated: January 2026*
