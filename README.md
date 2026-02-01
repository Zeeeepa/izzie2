# Izzie - Personal AI Assistant

Izzie is a personal AI assistant with persistent memory, entity/relationship discovery, and deep integration with your Google services, GitHub, and Telegram.

## Features

- **AI Chat** - Natural language interface powered by Claude Opus 4.5
- **Memory** - Persistent memory across conversations using Mem0 and Neo4j
- **Entity Extraction** - Automatically discovers people, companies, projects from your emails and calendar
- **Relationship Discovery** - Builds a knowledge graph of connections between entities
- **Gmail Integration** - Search, archive, send, filter, and manage emails
- **Google Tasks** - Create, complete, and manage task lists
- **Calendar** - View and query your schedule
- **Google Contacts** - Search and sync contacts
- **GitHub Issues** - List, create, and manage repository issues
- **Telegram Bot** - Chat with Izzie from mobile
- **MCP Server** - Use Izzie tools in Claude Desktop

See [User Guide](docs/USER_GUIDE.md) for detailed feature documentation.

## Quick Start

1. **Clone and install**
   ```bash
   git clone https://github.com/bobmatnyc/izzie2.git
   cd izzie2
   pnpm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys
   ```

3. **Set up database**
   ```bash
   pnpm db:migrate
   ```

4. **Run development server**
   ```bash
   pnpm dev
   ```

5. **Open [http://localhost:3300](http://localhost:3300)** and sign in with Google

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| AI | Claude Opus 4.5 via Anthropic SDK |
| Vector DB | Weaviate |
| Graph DB | Neo4j |
| SQL DB | Neon Postgres + Drizzle ORM |
| Memory | Mem0 |
| Events | Inngest |
| Auth | Better Auth + Google OAuth |
| UI | React 19, Tailwind CSS, Radix UI |
| Validation | Zod |

## Scripts

### Development
| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server (port 3300) |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format code with Prettier |
| `pnpm type-check` | Check TypeScript types |

### Testing
| Command | Description |
|---------|-------------|
| `pnpm test` | Run all tests |
| `pnpm test:unit` | Run unit tests |
| `pnpm test:integration` | Run integration tests |
| `pnpm test:e2e:playwright` | Run Playwright E2E tests |
| `pnpm test:regression` | Run regression tests |

### Database
| Command | Description |
|---------|-------------|
| `pnpm db:generate` | Generate migrations |
| `pnpm db:migrate` | Run migrations |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm db:push` | Push schema changes |

### Services
| Command | Description |
|---------|-------------|
| `pnpm mcp-server` | Start MCP server for Claude Desktop |
| `pnpm onboarding` | Start onboarding server |
| `pnpm onboarding:train` | Run training pipeline |

### Utilities
| Command | Description |
|---------|-------------|
| `pnpm benchmark` | Run performance benchmarks |
| `pnpm env:validate` | Validate environment variables |
| `pnpm check:relationships` | Check relationship graph |

## Environment Variables

Required variables (see `.env.example`):

- `ANTHROPIC_API_KEY` - Anthropic API key for Claude
- `DATABASE_URL` - Neon Postgres connection string
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` - Neo4j credentials
- `WEAVIATE_URL`, `WEAVIATE_API_KEY` - Weaviate credentials
- `MEM0_API_KEY` - Mem0 API key
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Google OAuth
- `TELEGRAM_BOT_TOKEN` - Telegram bot token (optional)
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` - Inngest credentials

## Documentation

- [User Guide](docs/USER_GUIDE.md) - End-user documentation
- [Architecture](docs/architecture/izzie-architecture.md) - System architecture
- [Auth Setup](docs/AUTH_SETUP.md) - Authentication configuration
- [Quick Start Guides](docs/guides/) - Feature-specific guides

## License

ISC
