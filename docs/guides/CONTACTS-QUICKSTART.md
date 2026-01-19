# Google Contacts Sync - Quick Start

## TL;DR

Google Contacts sync is **already fully implemented**. Just follow these steps to enable it:

## 1. Enable People API (5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. **APIs & Services** → **Library**
3. Search "People API" → **Enable**

## 2. Verify OAuth Scope (Already Done ✅)

The scope `https://www.googleapis.com/auth/contacts.readonly` is already configured in the codebase.

No code changes needed.

## 3. Test the Implementation

### Basic Test (No Authentication Required)
```bash
bun run scripts/test-contacts-sync.ts
```

Expected output:
```
✅ OAuth credentials found
✅ ContactsService created successfully
✨ All basic tests passed!
```

### Full Test (Requires Authenticated User)
```bash
# Get userId from database first
bun run scripts/test-contacts-sync.ts <userId>
```

This will:
- Fetch 10 contacts from Google
- Convert to Person/Company entities
- Save to Weaviate

## 4. Use the API

**Trigger Sync**:
```bash
curl -X POST http://localhost:3300/api/contacts/sync \
  -H "Cookie: your-session-cookie"
```

**Check Status**:
```bash
curl http://localhost:3300/api/contacts/sync \
  -H "Cookie: your-session-cookie"
```

## What Gets Synced?

Each contact creates:
- **1 Person entity** with name, email, phone
- **0-N Company entities** from their organizations

Example:
```
John Smith (john@example.com, +1234567890)
└── Works at Acme Corp as Software Engineer
```

Creates:
1. Person: "John Smith" (confidence: 0.95)
2. Company: "Acme Corp" (confidence: 0.9)

## Existing Users Need to Re-Authenticate

For users who signed up before contacts sync was added:

1. Sign out: Visit `/api/auth/sign-out`
2. Sign back in: Visit `/`
3. Accept new contacts permission

New users automatically get the contacts scope.

## Files to Know About

- **Service**: `/src/lib/google/contacts.ts`
- **API**: `/src/app/api/contacts/sync/route.ts`
- **Types**: `/src/lib/google/types.ts` (Contact interfaces)
- **Test**: `/scripts/test-contacts-sync.ts`
- **Docs**: `/docs/GOOGLE-CONTACTS-SYNC.md`

## Troubleshooting

**"People API has not been used"**
→ Enable People API in Google Cloud Console (step 1 above)

**"No Google access token found"**
→ User needs to sign in with Google

**"Insufficient Permission"**
→ User needs to re-authenticate (sign out + sign in)

## Next Steps

1. Enable People API in Google Cloud Console
2. Test with: `bun run scripts/test-contacts-sync.ts`
3. Have users re-authenticate to grant contacts permission
4. Trigger sync via API endpoint or let users manually trigger it

For detailed documentation, see `/docs/GOOGLE-CONTACTS-SYNC.md`.
