/**
 * Self-Awareness Context for Izzie
 *
 * Provides Izzie with knowledge about her own architecture,
 * capabilities, and connected data sources.
 */

import { BUILD_INFO } from '@/lib/build-info';
import { MODELS, MODEL_CONFIGS } from '@/lib/ai/models';

export interface ConnectorStatus {
  name: string;
  type: 'email' | 'calendar' | 'storage' | 'database';
  connected: boolean;
  description: string;
  capabilities: string[];
}

/**
 * Help-related query patterns for detecting when user needs assistance
 */
const HELP_PATTERNS = [
  /^help$/i,
  /\bwhat can you do\b/i,
  /\bwhat are your (features|capabilities)\b/i,
  /\bshow me (your )?(features|capabilities)\b/i,
  /\bhow do i use\b/i,
  /\bwhat (can|do) you (help|assist)\b/i,
  /\bfeatures\s*$/i,
  /\bcapabilities\s*$/i,
  /\bhelp me understand\b/i,
  /\btell me about yourself\b/i,
  /\bwhat are you\b/i,
  /\bintroduce yourself\b/i,
];

/**
 * Check if a query is asking for help or feature information
 */
export function isHelpQuery(query: string): boolean {
  const trimmed = query.trim();
  return HELP_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Feature-centric documentation extracted from USER_GUIDE.md
 * This provides a high-level overview of what Izzie can do
 */
export const FEATURE_DOCUMENTATION = {
  chat: {
    title: 'Chat with Memory',
    description:
      'Your main AI assistant interface. Ask questions naturally and Izzie will help using connected tools.',
    examples: [
      'Email: "Show me unread emails from John", "Send an email to sarah@example.com"',
      'Tasks: "What tasks do I have due this week?", "Create a task to review the report by Friday"',
      'Calendar: "What\'s on my calendar today?", "Show me tomorrow\'s meetings"',
      'GitHub: "Show me open issues in myorg/myrepo", "Create a new issue for the login bug"',
      'Contacts: "Find contact info for John Smith", "Who works at Acme Corp?"',
      'Research: "Research the latest AI developments", "What have I discussed with John in emails?"',
    ],
  },
  entities: {
    title: 'Entity Discovery',
    description:
      'Browse extracted people, companies, projects, and more from your emails and calendar.',
    entityTypes: [
      'Person - People mentioned in your communications',
      'Company - Organizations and businesses',
      'Project - Projects you\'re working on',
      'Topic - Subjects and themes',
      'Location - Places and addresses',
      'Action Item - Tasks mentioned in emails',
    ],
    features: [
      'Filter by type using the type cards',
      'Search to find specific entities',
      'Click any entity card to see details',
      'Confidence scores (0-100%) indicate extraction accuracy',
    ],
  },
  relationships: {
    title: 'Relationship Graph',
    description:
      'View how entities connect to each other in an interactive graph visualization.',
    relationshipTypes: {
      professional: ['WORKS_WITH', 'WORKS_FOR', 'REPORTS_TO', 'LEADS', 'WORKS_ON', 'EXPERT_IN'],
      business: ['PARTNERS_WITH', 'COMPETES_WITH', 'OWNS'],
      structural: ['RELATED_TO', 'DEPENDS_ON', 'PART_OF', 'SUBTOPIC_OF', 'ASSOCIATED_WITH'],
      geographic: ['LOCATED_IN'],
      personal: ['FRIEND_OF', 'FAMILY_OF', 'MARRIED_TO', 'SIBLING_OF'],
    },
    features: [
      'Pan and zoom the graph',
      'Click entities to see details',
      'Click relationship lines to see connection details',
      'Filter by entity or relationship type',
      'Refresh to discover new connections',
    ],
  },
  train: {
    title: 'Training & RLHF',
    description: 'Help Izzie improve accuracy through human feedback.',
    features: [
      'Select sample size (50, 100, 250, or 500)',
      'Set API budget ($5, $10, $25, or $50)',
      'Choose training mode: Collect Feedback or Auto-Train',
      'Review predictions and mark correct/incorrect',
      'Exception Queue for low-confidence predictions',
      'Export training data in OpenAI or Anthropic formats',
    ],
  },
  calendar: {
    title: 'Calendar Integration',
    description: 'View your Google Calendar events and schedule.',
    features: [
      'View today\'s schedule',
      'Browse upcoming events',
      'See event details including location and attendees',
      'Ask Izzie about your calendar in chat',
    ],
  },
  telegram: {
    title: 'Telegram Bot',
    description: 'Use Izzie from anywhere with the Telegram bot.',
    features: [
      'Chat with Izzie from mobile',
      'Receive notifications for important emails',
      'Get calendar reminders',
      'Manage tasks on the go',
    ],
  },
  mcp: {
    title: 'MCP Server for Claude Desktop',
    description:
      'Use Izzie\'s capabilities directly in Claude Desktop via Model Context Protocol.',
    features: [
      'Generate API keys in Settings > MCP',
      'Connect Claude Desktop to Izzie',
      'Use Izzie tools directly in Claude conversations',
      'Scoped API keys with expiration for security',
    ],
  },
};

/**
 * Search documentation for relevant information
 * Returns matching sections based on keywords
 */
export function searchDocumentation(query: string): string[] {
  const results: string[] = [];
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(/\s+/).filter((w) => w.length > 2);

  for (const [key, feature] of Object.entries(FEATURE_DOCUMENTATION)) {
    const featureText = JSON.stringify(feature).toLowerCase();
    const matches = keywords.some((kw) => featureText.includes(kw));

    if (matches) {
      const f = feature as { title: string; description: string; examples?: string[]; features?: string[] };
      if (f.examples) {
        results.push(
          `**${f.title}**: ${f.description}\nExamples:\n${f.examples.map((e) => `  - ${e}`).join('\n')}`
        );
      } else if (f.features) {
        results.push(
          `**${f.title}**: ${f.description}\nFeatures:\n${f.features.map((feat) => `  - ${feat}`).join('\n')}`
        );
      } else {
        results.push(`**${f.title}**: ${f.description}`);
      }
    }
  }

  return results;
}

export interface SelfAwarenessContext {
  identity: {
    name: string;
    version: string;
    description: string;
    underlyingModel: string;
  };
  architecture: {
    contextWindow: string;
    memorySystem: string;
    entitySystem: string;
    sessionManagement: string;
  };
  connectors: ConnectorStatus[];
  capabilities: string[];
}

/**
 * Generate feature-centric capabilities list
 * Groups capabilities by user-facing features rather than technical tools
 */
function generateFeatureCentricCapabilities(): string[] {
  return [
    // Core Features (feature-centric, not tool-centric)
    '**Chat with Memory**: Have natural conversations with context awareness. I remember our previous discussions and can help with email, tasks, calendar, GitHub, contacts, and research.',
    '**Email Management**: Read, archive, label, send, and filter emails. Create drafts, move messages, and manage your inbox efficiently.',
    '**Task Management**: Create, complete, and organize tasks in Google Tasks. Manage task lists and track what\'s due.',
    '**Calendar Access**: View your schedule, upcoming meetings, and event details. Ask about your availability.',
    '**GitHub Integration**: List, create, and update issues. Add comments and track your repositories.',
    '**Contact Search**: Find people in your contacts, get details, and see who works where.',
    '**Research**: Search across web, email, and Drive to answer complex questions and gather information.',
    '**Entity Discovery**: Browse extracted people, companies, projects, and topics from your communications.',
    '**Relationship Mapping**: Visualize connections between entities in an interactive graph.',
    '**Training (RLHF)**: Help improve my accuracy through feedback on predictions.',
    '**Telegram Bot**: Chat with me on mobile, receive notifications, and manage tasks on the go.',
    '**MCP Integration**: Use my capabilities directly in Claude Desktop via API.',
  ];
}

/**
 * Get the current self-awareness context
 */
export async function getSelfAwarenessContext(userId: string): Promise<SelfAwarenessContext> {
  // TODO: In future, check actual connection status from DB
  // For now, return static architecture info

  // Get the underlying model name from config
  const generalModelId = MODELS.GENERAL;
  const modelConfig = MODEL_CONFIGS[generalModelId];
  const modelDisplayName = generalModelId
    .replace('anthropic/', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    identity: {
      name: 'Izzie',
      version: BUILD_INFO.version,
      description: `A personal AI assistant with memory and context awareness (build: ${BUILD_INFO.gitHash}, ${BUILD_INFO.gitBranch})`,
      underlyingModel: modelDisplayName,
    },
    architecture: {
      contextWindow:
        'Sliding window with last 5 message pairs kept verbatim, older messages compressed into summaries',
      memorySystem:
        'Extracts memories (facts, preferences, events, decisions, sentiments, reminders, relationships) from connected sources with temporal decay - frequently accessed memories stay relevant longer',
      entitySystem:
        'Extracts and tracks entities (people, companies, projects, topics, locations, action items, dates) from emails with deduplication and user identity awareness',
      sessionManagement:
        'Maintains conversation sessions with current task tracking, compressed history, and context retrieval from Weaviate vector database',
    },
    connectors: [
      {
        name: 'Gmail',
        type: 'email',
        connected: true,
        description: 'Access to email messages for entity and memory extraction',
        capabilities: [
          'Read email content and metadata',
          'Extract entities (people, companies, projects)',
          'Extract memories (facts, preferences, events)',
          'Track communication patterns',
        ],
      },
      {
        name: 'Google Calendar',
        type: 'calendar',
        connected: true,
        description: 'Access to calendar events and schedules',
        capabilities: [
          'Read upcoming events',
          'Extract meeting participants',
          'Track scheduling patterns',
        ],
      },
      {
        name: 'Google Drive',
        type: 'storage',
        connected: true,
        description: 'Access to documents and files',
        capabilities: [
          'Read document content',
          'Extract topics and projects',
          'Track document activity',
        ],
      },
      {
        name: 'Weaviate',
        type: 'database',
        connected: true,
        description: 'Vector database for semantic search of entities and memories',
        capabilities: [
          'Semantic search across all extracted data',
          'Fast retrieval of relevant context',
          'Decay-weighted memory ranking',
        ],
      },
    ],
    // Feature-centric capabilities instead of tool listings
    capabilities: generateFeatureCentricCapabilities(),
  };
}

/**
 * Format self-awareness context for inclusion in system prompt
 */
export function formatSelfAwarenessForPrompt(context: SelfAwarenessContext): string {
  const connectorList = context.connectors
    .filter((c) => c.connected)
    .map((c) => `- ${c.name}: ${c.description}`)
    .join('\n');

  const capabilityList = context.capabilities.map((c) => `- ${c}`).join('\n');

  return `## About Me (${context.identity.name} v${context.identity.version})

**My Identity:**
- Name: ${context.identity.name}
- Version: ${context.identity.version}
- Underlying AI Model: ${context.identity.underlyingModel}
- ${context.identity.description}

**Important:** When asked "what version are you?" or "what's your version?", I should respond with my version number (${context.identity.version}). When asked "what model are you?" or "what AI are you running on?", I should say I am Izzie, built on ${context.identity.underlyingModel}. I am NOT just Claude - I am Izzie, a specialized personal AI assistant with my own version, capabilities, and connected data sources.

### My Architecture
- **Context Window**: ${context.architecture.contextWindow}
- **Memory System**: ${context.architecture.memorySystem}
- **Entity System**: ${context.architecture.entitySystem}
- **Session Management**: ${context.architecture.sessionManagement}

### Connected Data Sources
${connectorList}

### What I Can Do
${capabilityList}

When asked about myself, my version, my capabilities, architecture, or connected data sources, I should explain these accurately and specifically. I know my version number, what I'm built on, and what makes me unique.`;
}

/**
 * Generate a comprehensive help response for help-related queries
 * This is used when isHelpQuery() returns true
 */
export function generateHelpResponse(): string {
  const features = Object.values(FEATURE_DOCUMENTATION);

  let response = `# What I Can Help You With

I'm **Izzie**, your AI-powered personal assistant. Here's everything I can do:

`;

  // Chat section with examples
  const chat = FEATURE_DOCUMENTATION.chat;
  response += `## ${chat.title}
${chat.description}

**Try asking:**
${chat.examples.map((e) => `- ${e}`).join('\n')}

`;

  // Other features
  const otherFeatures = ['entities', 'relationships', 'train', 'calendar', 'telegram', 'mcp'] as const;
  for (const key of otherFeatures) {
    const feature = FEATURE_DOCUMENTATION[key];
    response += `## ${feature.title}
${feature.description}
`;
    if ('features' in feature) {
      response += `${feature.features.map((f) => `- ${f}`).join('\n')}
`;
    }
    if ('entityTypes' in feature) {
      response += `\n**Entity Types:**\n${(feature as typeof FEATURE_DOCUMENTATION.entities).entityTypes.map((t) => `- ${t}`).join('\n')}
`;
    }
    response += '\n';
  }

  response += `---
**Tip:** Just ask naturally! I understand conversational requests and will use my tools automatically.
`;

  return response;
}
