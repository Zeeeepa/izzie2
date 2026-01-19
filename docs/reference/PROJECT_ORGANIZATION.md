# Project Organization Standard

**Version**: 1.0.0
**Last Updated**: 2026-01-19

## Directory Structure

```
izzie2/
├── src/                           # Application source code
│   ├── app/                       # Next.js App Router
│   │   ├── api/                   # API routes
│   │   └── dashboard/             # Dashboard pages
│   ├── components/                # React components
│   ├── lib/                       # Shared libraries
│   │   ├── ai/                    # AI/LLM integrations
│   │   ├── auth/                  # Authentication
│   │   ├── chat/                  # Chat session management
│   │   ├── db/                    # Database (Drizzle ORM)
│   │   ├── events/                # Inngest event functions
│   │   ├── extraction/            # Entity extraction
│   │   ├── google/                # Google API integrations
│   │   ├── memory/                # Memory system
│   │   ├── relationships/         # Relationship management
│   │   ├── search/                # Search functionality
│   │   └── weaviate/              # Weaviate vector storage
│   ├── agents/                    # Agent implementations
│   └── types/                     # TypeScript type definitions
├── scripts/                       # Utility and test scripts
│   ├── *.ts                       # TypeScript scripts
│   ├── *.mjs                      # ESM JavaScript scripts
│   ├── *.sh                       # Shell scripts
│   └── *.html                     # Test HTML pages
├── docs/                          # Documentation
│   ├── implementation/            # Feature implementation summaries
│   ├── guides/                    # Quickstart and setup guides
│   ├── fixes/                     # Bug fix documentation
│   ├── tickets/                   # Ticket/phase summaries
│   ├── testing/                   # Test reports and results
│   ├── reference/                 # API docs, status reports
│   ├── research/                  # Research findings
│   └── fixes/                     # Fix documentation
├── drizzle/                       # Database migrations
└── tests/                         # Test files (if separate from src)
```

## File Placement Rules

### Documentation (`docs/`)

| Directory | Purpose | File Examples |
|-----------|---------|---------------|
| `docs/implementation/` | Feature implementation summaries | `*_IMPLEMENTATION.md`, `*_SUMMARY.md` |
| `docs/guides/` | Quickstart and setup guides | `*-QUICKSTART.md`, `*_README.md`, `START-HERE.md` |
| `docs/fixes/` | Bug fix documentation | `*_FIX.md`, `*-FIX-*.md`, `*_FIX_REPORT.md` |
| `docs/tickets/` | Ticket/phase summaries | `TICKET_*.md`, `PHASE*_SUMMARY.md` |
| `docs/testing/` | Test reports and results | `*_TEST_RESULTS.md`, `*_TEST_REPORT.md` |
| `docs/reference/` | API docs, status reports | `*_API_ENDPOINTS.md`, `*_STATUS.md` |
| `docs/research/` | Research findings | `*-analysis-*.md`, `*-investigation-*.md` |

### Scripts (`scripts/`)

| File Type | Purpose | Location |
|-----------|---------|----------|
| `*.ts` | TypeScript utility scripts | `scripts/` |
| `*.mjs` | ESM JavaScript scripts | `scripts/` |
| `*.sh` | Shell scripts | `scripts/` |
| `*.html` | Test HTML pages | `scripts/` |

### Protected Root Files

These files MUST remain in the project root:

- `README.md` - Project documentation
- `CLAUDE.md` - AI assistant instructions
- `CHANGELOG.md` - Version history
- `package.json`, `package-lock.json` - Node.js config
- `tsconfig.json` - TypeScript config
- `next.config.ts` - Next.js config
- `tailwind.config.ts` - Tailwind CSS config
- `postcss.config.mjs` - PostCSS config
- `drizzle.config.ts` - Drizzle ORM config
- `vitest.config.ts` - Vitest config
- `playwright.config.ts` - Playwright config
- `components.json` - shadcn/ui config
- `.env*` - Environment files

## Naming Conventions

### Files

- **TypeScript/JavaScript**: `kebab-case.ts` or `camelCase.ts` (follow existing patterns)
- **React Components**: `PascalCase.tsx`
- **Documentation**: `UPPER_CASE.md` or `kebab-case.md`
- **Config files**: `lowercase.config.{ts,js,mjs}`

### Directories

- Use `kebab-case` for all directories
- Exception: `src/` uses existing Next.js conventions

## Migration History

### 2026-01-19: Initial Organization

**Files Moved**:
- 118 documentation files from root to `docs/` subdirectories
- 13 utility scripts from root to `scripts/`

**Categories Created**:
- `docs/implementation/` - 63 files
- `docs/guides/` - 12 files
- `docs/fixes/` - 20 files
- `docs/tickets/` - 4 files
- `docs/testing/` - 14 files
- `docs/reference/` - 11 files
