# Onboarding Test Harness

A standalone development tool for testing email classification and relationship discovery.

## Architecture

This is a **separate test harness** that runs independently from the main Izzie app.
It shares the same TypeScript toolchain but has its own:
- Express server (port 3333)
- OAuth flow for Gmail access
- UI for visualizing discovered relationships

## Environment Loading

**Important**: ES modules hoist imports, so we use a separate `env.ts` module
to ensure `.env.local` is loaded before any route modules that need credentials.

```
env.ts          <- Loaded first (imports dotenv, calls config)
server.ts       <- Imports env.ts first, then other modules
routes/oauth.ts <- Can now access GOOGLE_CLIENT_ID
```

## Running

```bash
# From project root
pnpm onboarding

# Or directly
npx tsx src/onboarding/server.ts
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Web UI |
| GET | `/health` | Health check |
| GET | `/oauth/login` | Start OAuth flow |
| GET | `/oauth/callback` | OAuth callback |
| GET | `/oauth/status` | Check auth status |
| GET | `/api/events` | SSE stream for real-time updates |
| POST | `/api/start` | Start email processing |
| POST | `/api/pause` | Pause processing |
| POST | `/api/resume` | Resume processing |
| POST | `/api/stop` | Stop processing |
| POST | `/api/flush` | Clear all discovered data |
| GET | `/api/entities` | Get discovered entities |
| GET | `/api/relationships` | Get discovered relationships |

## Required Environment Variables

In `.env.local` at project root:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

## Troubleshooting

**OAuth not working?**
1. Check that `.env.local` exists in project root
2. Verify GOOGLE_CLIENT_ID is set: `grep GOOGLE_CLIENT_ID .env.local`
3. Check server logs for `[onboarding] Loaded env from .env.local`
