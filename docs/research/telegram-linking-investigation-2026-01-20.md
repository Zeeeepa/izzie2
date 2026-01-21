# Telegram Account Linking - Investigation Report

**Date:** 2026-01-20
**Status:** Complete Implementation Found

## Overview

The Telegram account linking feature is fully implemented with a webhook-based architecture. The flow allows users to connect their Telegram account to izzie for receiving notifications and chatting with the AI assistant.

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TELEGRAM ACCOUNT LINKING FLOW                        │
└─────────────────────────────────────────────────────────────────────────────┘

1. USER GENERATES CODE (Web App)
   ┌──────────────────┐       POST /api/telegram/link       ┌──────────────────┐
   │  Telegram        │ ─────────────────────────────────▶  │  API Route       │
   │  Settings Page   │                                     │  (link/route.ts) │
   │  (page.tsx)      │  ◀─────────────────────────────────  │                  │
   └──────────────────┘   { code: "123456", expiresIn: 300 } └──────────────────┘
          │                                                          │
          │                                                          ▼
          │                                               ┌──────────────────┐
          │                                               │  linking.ts      │
          │                                               │  generateLinkCode│
          │                                               │  - Delete old    │
          │                                               │  - Insert new    │
          │                                               │  - 5min expiry   │
          │                                               └──────────────────┘
          │                                                          │
          │                                                          ▼
          │                                               ┌──────────────────┐
          │                                               │  telegram_link_  │
          │                                               │  codes table     │
          │                                               │  (DB Storage)    │
          │                                               └──────────────────┘
          │
          │ Shows code to user: "123456"
          │ Polls GET /api/telegram/link every 3s
          ▼

2. USER SENDS CODE TO TELEGRAM BOT
   ┌──────────────────┐                                   ┌──────────────────┐
   │  Telegram App    │ ────  /start 123456  ──────────▶  │  Telegram        │
   │  (User's phone)  │                                   │  Servers         │
   └──────────────────┘                                   └──────────────────┘
                                                                   │
                                                                   ▼
                                                         Webhook POST to:
                                                         /api/telegram/webhook
                                                                   │
                                                                   ▼
3. WEBHOOK RECEIVES & VALIDATES
   ┌──────────────────┐       TelegramUpdate              ┌──────────────────┐
   │  Telegram        │ ─────────────────────────────────▶│  webhook/        │
   │  Webhook Route   │  { message: { text: "/start      ││  route.ts        │
   │                  │    123456", chat: { id: ... } }}  ││                  │
   └──────────────────┘                                   └──────────────────┘
          │
          │ 1. Verify X-Telegram-Bot-Api-Secret-Token
          │ 2. Extract code from "/start 123456"
          │ 3. Call verifyLinkCode(code, chatId, username)
          ▼

4. VERIFICATION & LINKING
   ┌──────────────────┐                                   ┌──────────────────┐
   │  linking.ts      │ ─────────────────────────────────▶│  Database        │
   │  verifyLinkCode  │                                   │                  │
   └──────────────────┘                                   └──────────────────┘
          │
          │ 1. Find code in telegram_link_codes where:
          │    - code matches
          │    - not used
          │    - not expired (expiresAt > now)
          │ 2. Mark code as used
          │ 3. Insert/update telegram_links:
          │    - userId (from code lookup)
          │    - telegramChatId
          │    - telegramUsername
          ▼

5. SUCCESS RESPONSE TO USER
   ┌──────────────────┐                                   ┌──────────────────┐
   │  bot.ts          │ ─────────────────────────────────▶│  Telegram        │
   │  sendMessage()   │  "Your Telegram is now linked!   ││  Servers         │
   │                  │   Hi [name], I'm Izzie..."       ││  → User's phone  │
   └──────────────────┘                                   └──────────────────┘

6. WEB APP DETECTS LINK (Polling)
   ┌──────────────────┐       GET /api/telegram/link      ┌──────────────────┐
   │  Telegram        │ ─────────────────────────────────▶│  API Route       │
   │  Settings Page   │                                   │                  │
   │  (polling)       │  ◀─────────────────────────────────│                  │
   └──────────────────┘   { linked: true, username: "..." }└──────────────────┘
          │
          │ Updates UI to show linked status
          ▼
   ┌──────────────────────────────────────────┐
   │  UI shows: "@username Linked"            │
   │  + "Unlink Account" button               │
   └──────────────────────────────────────────┘
```

---

## File Paths for Each Component

### 1. UI Components

| File | Purpose |
|------|---------|
| `src/app/dashboard/settings/telegram/page.tsx` | Main settings page with Link/Unlink buttons |

**Key Features:**
- State management for link status, linking flow, countdown timer
- Polls for link completion every 3 seconds when showing code
- Countdown timer (5 minutes) with visual feedback
- Cancel and retry functionality

### 2. API Routes

| File | Method | Purpose |
|------|--------|---------|
| `src/app/api/telegram/link/route.ts` | GET | Check link status for authenticated user |
| `src/app/api/telegram/link/route.ts` | POST | Generate new 6-digit link code |
| `src/app/api/telegram/link/route.ts` | DELETE | Unlink Telegram account |
| `src/app/api/telegram/webhook/route.ts` | POST | Receive Telegram bot updates (webhook) |

### 3. Core Logic

| File | Purpose |
|------|---------|
| `src/lib/telegram/linking.ts` | Code generation, verification, link management |
| `src/lib/telegram/bot.ts` | Telegram Bot API client (singleton) |
| `src/lib/telegram/message-handler.ts` | Process messages from linked users |
| `src/lib/telegram/types.ts` | TypeScript types for Telegram API |

### 4. Database Schema

| File | Tables |
|------|--------|
| `src/lib/db/schema.ts` | `telegram_links`, `telegram_link_codes`, `telegram_sessions` |
| `drizzle/migrations/0010_add_telegram_tables.sql` | Migration for Telegram tables |

---

## Database Tables

### telegram_link_codes
```sql
code          VARCHAR(6) PRIMARY KEY  -- 6-digit linking code
user_id       TEXT NOT NULL           -- References users.id
expires_at    TIMESTAMP NOT NULL      -- Code expiration (5 minutes from creation)
used          BOOLEAN DEFAULT FALSE   -- Prevents code reuse
```

### telegram_links
```sql
id                 UUID PRIMARY KEY
user_id            TEXT UNIQUE NOT NULL  -- One Telegram per user
telegram_chat_id   BIGINT UNIQUE NOT NULL
telegram_username  TEXT                   -- Optional, from Telegram
linked_at          TIMESTAMP NOT NULL
```

### telegram_sessions
```sql
id              UUID PRIMARY KEY
telegram_chat_id BIGINT UNIQUE NOT NULL
chat_session_id  UUID NOT NULL           -- Links to chat_sessions for context
created_at       TIMESTAMP
updated_at       TIMESTAMP
```

---

## Bot Configuration

### Environment Variables
```env
TELEGRAM_BOT_TOKEN=     # Bot token from @BotFather
TELEGRAM_WEBHOOK_SECRET= # Secret for webhook verification
```

### Bot Name/Username
**Not hardcoded in the codebase.** The bot is configured via `TELEGRAM_BOT_TOKEN` and users must:
1. Search for the bot manually in Telegram
2. Or be provided the bot username through external means (documentation, email, etc.)

**Observation:** The welcome message in `webhook/route.ts` says:
> "Open Telegram and search for our bot"

But doesn't specify the bot name. This could be improved.

---

## Webhook Handling

### Security
- **Secret Token Verification:** Uses `X-Telegram-Bot-Api-Secret-Token` header
- **Graceful Errors:** Always returns 200 OK to prevent Telegram retries
- **No sensitive data exposure:** Errors logged server-side only

### Message Types Handled
1. `/start <6-digit-code>` - Account linking
2. `/start` - Welcome message with instructions
3. Regular text messages - Processed through AI chat system

### Unlinked User Handling
If an unlinked user sends a message, they receive:
> "Your Telegram account isn't linked yet. Please visit izzie.ai/settings to get a linking code."

---

## Code Generation Details

- **Format:** 6-digit numeric code (100000-999999)
- **Expiration:** 5 minutes
- **Storage:** `telegram_link_codes` table
- **Cleanup:** Previous codes for user are deleted when new code is generated
- **One-time use:** Code marked as `used=true` after successful verification

---

## Observations and Potential Issues

### 1. Bot Name Not Displayed
**Issue:** Users are told to "search for our bot" but the bot username is not shown.
**Location:** `src/app/dashboard/settings/telegram/page.tsx` line 380
**Suggestion:** Add bot username to the help section or fetch via `getMe()` API

### 2. No Deep Link Support
**Issue:** User must manually find the bot and type/paste the code
**Suggestion:** Could use Telegram deep links: `https://t.me/BOT_USERNAME?start=CODE`

### 3. Error Recovery
**Good:** The system handles errors gracefully
- Expired codes show clear message
- Invalid codes show clear message
- Web UI has retry functionality

### 4. Session Management
**Good:** Creates dedicated `telegram_sessions` table to map Telegram chats to chat sessions, preserving conversation context across platforms.

### 5. Logging
**Good:** Comprehensive logging with `[TelegramWebhook]`, `[TelegramLinking]`, `[TelegramHandler]` prefixes for debugging.

---

## Summary

The Telegram account linking feature is **fully implemented** with:
- A clean separation of concerns (UI, API, core logic)
- Proper security (webhook secret, code expiration)
- Good error handling and user feedback
- Session continuity between Telegram and web chat

**Main improvement opportunity:** Display the bot username to users instead of asking them to search for it.
