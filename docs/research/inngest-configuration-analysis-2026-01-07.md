# Inngest Configuration Analysis

**Date**: 2026-01-07
**Project**: izzie2
**Error**: "401 Event key not found"

## Executive Summary

The izzie2 project has Inngest properly configured in code with 12 functions registered, but is **missing required environment variables** in `.env.local`. The "401 Event key not found" error occurs because:

1. `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are not set in `.env.local`
2. The Inngest dev server is not running (nothing on port 8288)
3. For local development, you need **either** the dev server OR the event keys (dev server is recommended)

## Current Configuration State

### ✅ Code Configuration (GOOD)

**Inngest Client Setup**: `/Users/masa/Projects/izzie2/src/lib/events/index.ts`
```typescript
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'izzie2',
  name: 'Izzie2 AI Assistant',
  eventKey: process.env.INNGEST_EVENT_KEY,  // ⚠️ Undefined in .env.local
});
```

**API Route**: `/Users/masa/Projects/izzie2/src/app/api/inngest/route.ts`
```typescript
import { serve } from 'inngest/next';
import { inngest } from '@/lib/events';
import { functions } from '@/lib/events/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,  // 12 functions registered
});
```

### ❌ Environment Variables (MISSING)

**Current `.env.local`**: Missing Inngest keys
```bash
# OpenRouter API Key for models
OPENROUTER_API_KEY=your-openrouter-api-key

# Database
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Better Auth
BETTER_AUTH_SECRET=your-better-auth-secret
NEXT_PUBLIC_APP_URL=http://localhost:3300

# ⚠️ MISSING: INNGEST_EVENT_KEY
# ⚠️ MISSING: INNGEST_SIGNING_KEY
```

**Expected (from `.env.example`)**:
```bash
# Inngest (event-driven workflows)
INNGEST_EVENT_KEY=your_event_key
INNGEST_SIGNING_KEY=your_signing_key
```

### ❌ Dev Server Status (NOT RUNNING)

```bash
$ lsof -i :8288
No process listening on port 8288
```

The Inngest dev server is **not running**. This is needed for local development.

## Registered Inngest Functions

The project has **12 functions** defined in `/Users/masa/Projects/izzie2/src/lib/events/functions/index.ts`:

1. **classifyEvent** - Event classification
2. **processEvent** - Event processing
3. **sendNotification** - Notification sending
4. **scheduleEventFunction** - Event scheduling
5. **ingestEmails** - Email ingestion (cron: hourly)
6. **ingestDrive** - Drive ingestion (cron: hourly)
7. **ingestCalendar** - Calendar ingestion
8. **extractTaskEntities** - Task entity extraction
9. **extractEntitiesFromEmail** - Email entity extraction
10. **extractEntitiesFromDrive** - Drive entity extraction
11. **extractEntitiesFromCalendar** - Calendar entity extraction
12. **updateGraph** - Knowledge graph updates

## Root Cause Analysis

### Why "401 Event key not found" Error Occurs

When you try to send events to Inngest without proper configuration:

```typescript
// In src/lib/events/index.ts
eventKey: process.env.INNGEST_EVENT_KEY,  // undefined
```

If `INNGEST_EVENT_KEY` is undefined and the dev server isn't running:
- Inngest SDK tries to authenticate with cloud service
- No event key provided → 401 Unauthorized
- Error: "Event key not found"

### Two Authentication Modes

**Production Mode** (Cloud Inngest):
- Requires: `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`
- Events sent to Inngest cloud service
- Used for production deployments

**Development Mode** (Local Dev Server):
- Requires: Inngest dev server running (`npx inngest-cli@latest dev`)
- No event keys needed
- Events handled locally with UI at http://localhost:8288
- **Recommended for local development**

## Solution: Steps to Fix

### Option 1: Use Inngest Dev Server (RECOMMENDED for local dev)

This is the easiest approach for local development:

```bash
# 1. Start Inngest dev server in a new terminal
npx inngest-cli@latest dev

# This will:
# - Start dev server on port 8288
# - Provide UI at http://localhost:8288
# - Auto-discover your functions
# - No event keys needed

# 2. Start your Next.js app in another terminal
npm run dev

# 3. The dev server will auto-register your app at:
#    http://localhost:3300/api/inngest
```

**Verification**:
1. Open http://localhost:8288 in browser
2. Navigate to "Apps" → should show "izzie2"
3. Navigate to "Functions" → should show all 12 functions
4. Send test event to verify it works

### Option 2: Use Production Event Keys (for cloud testing)

If you need to test with cloud Inngest:

```bash
# 1. Sign up at https://www.inngest.com/
# 2. Create a new app
# 3. Get your event key and signing key
# 4. Add to .env.local:

INNGEST_EVENT_KEY=your_actual_event_key_here
INNGEST_SIGNING_KEY=your_actual_signing_key_here

# 5. Restart Next.js
npm run dev
```

## Testing Inngest Setup

### Test 1: Verify Endpoint

```bash
# Check if Inngest endpoint responds
curl http://localhost:3300/api/inngest

# Should return Inngest SDK metadata
```

### Test 2: Send Test Event

```bash
# Using the test endpoint created in INNGEST_STATUS.md
curl -X POST http://localhost:3300/api/test/send-event \
  -H "Content-Type: application/json" \
  -d '{"eventName": "test/ping", "data": {"message": "hello"}}'

# Should return event ID if successful
```

### Test 3: Check Dev Server UI

If using dev server approach:

1. Open http://localhost:8288
2. Check "Events" tab for your test event
3. Check "Runs" tab to see if functions executed
4. View logs and execution details

## Common Issues and Solutions

### Issue: "Cannot connect to Inngest"
**Solution**: Make sure dev server is running on port 8288 OR event keys are set

### Issue: "Functions not showing in dev server"
**Solution**:
1. Restart dev server: `npx inngest-cli@latest dev`
2. Restart Next.js: `npm run dev`
3. Manually register app in dev server UI: http://localhost:8288

### Issue: "Events sent but functions not triggering"
**Solution**: Check function trigger configuration in code. Functions need proper event name matching:

```typescript
// Example from extract-entities.ts
inngest.createFunction(
  { id: 'extract-entities-from-email' },
  { event: 'izzie/ingestion.email.extracted' },  // Must match sent event name
  async ({ event, step }) => {
    // Function logic
  }
);
```

## Next Steps

### Immediate (Fix Current Error)

1. **Start Inngest dev server**:
   ```bash
   npx inngest-cli@latest dev
   ```

2. **Keep dev server running** while developing

3. **Verify in browser**: http://localhost:8288

### For Production Deployment

1. **Sign up for Inngest account**: https://www.inngest.com/
2. **Create app and get credentials**
3. **Add to production environment**:
   - `INNGEST_EVENT_KEY`
   - `INNGEST_SIGNING_KEY`
4. **Configure production webhook**: Point Inngest to your production `/api/inngest` endpoint

### Optional: Add to package.json

For easier development, add a script:

```json
{
  "scripts": {
    "dev": "next dev --turbopack -p 3300",
    "dev:inngest": "npx inngest-cli@latest dev",
    "dev:all": "concurrently \"npm run dev\" \"npm run dev:inngest\""
  }
}
```

Then you can run both with: `npm run dev:all`

## References

- **Inngest Documentation**: https://www.inngest.com/docs
- **Inngest Status Report**: `/Users/masa/Projects/izzie2/INNGEST_STATUS.md`
- **Inngest Client Setup**: `/Users/masa/Projects/izzie2/src/lib/events/index.ts`
- **Inngest Functions**: `/Users/masa/Projects/izzie2/src/lib/events/functions/`
- **API Route**: `/Users/masa/Projects/izzie2/src/app/api/inngest/route.ts`

## Key Findings Summary

| Component | Status | Details |
|-----------|--------|---------|
| Inngest SDK | ✅ Installed | v3.48.1 |
| Client Configuration | ✅ Configured | In `src/lib/events/index.ts` |
| API Route | ✅ Configured | `/api/inngest` |
| Functions Registered | ✅ 12 functions | All exported in `functions/index.ts` |
| Environment Variables | ❌ Missing | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` not in `.env.local` |
| Dev Server | ❌ Not Running | Port 8288 empty |
| **Root Cause** | **Identified** | **Need to start dev server OR add event keys** |

## Recommendation

**For local development**: Use Inngest dev server approach (Option 1). It's easier, provides a UI for debugging, and doesn't require signing up for cloud service.

**For production**: Use cloud Inngest with event keys (Option 2). This is required for production deployments.

**Immediate action**: Run `npx inngest-cli@latest dev` in a separate terminal while developing.
