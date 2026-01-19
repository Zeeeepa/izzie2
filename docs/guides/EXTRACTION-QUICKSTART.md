# Email Extraction Quickstart Guide

## Problem Solved
The batch extraction script failed because it required service account OAuth with domain-wide delegation. This solution uses your logged-in user's OAuth tokens instead.

## What Was Created

### 1. New API Endpoint
**File**: `src/app/api/gmail/sync-user/route.ts`
- Uses user OAuth tokens (from better-auth session)
- Follows the same pattern as the calendar API
- No service account or domain-wide delegation needed

### 2. Browser-Based Trigger UI
**File**: `trigger-user-sync.html`
- Simple web interface to trigger extraction
- Real-time status monitoring
- Works with your session cookie

## How to Use

### Option 1: Browser UI (Easiest)

1. **Make sure you're logged in** at `http://localhost:3300`

2. **Open the trigger UI** in your browser:
   ```bash
   open trigger-user-sync.html
   # Or open it manually in your browser
   ```

3. **Configure and Start**:
   - Select folder (recommend "Sent" for high-signal data)
   - Set max emails (default 100)
   - Optionally set a "since" date
   - Click "Start Sync"

4. **Monitor Progress**:
   - Real-time status updates
   - Log shows emails being processed
   - Extraction events being sent to Inngest

### Option 2: Browser Console (Quick Test)

1. **Navigate to** `http://localhost:3300` in your browser

2. **Open browser console** (F12 or Cmd+Option+I)

3. **Paste and run**:
   ```javascript
   // Start sync
   fetch('http://localhost:3300/api/gmail/sync-user', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     credentials: 'include',
     body: JSON.stringify({
       folder: 'sent',      // 'sent', 'inbox', or 'all'
       maxResults: 100,     // Number of emails
       // since: '2024-01-01' // Optional
     })
   })
   .then(res => res.json())
   .then(data => console.log('Started:', data));

   // Check status
   setInterval(async () => {
     const status = await fetch('http://localhost:3300/api/gmail/sync-user', {
       credentials: 'include'
     }).then(r => r.json());
     console.log('Status:', status);
   }, 2000);
   ```

### Option 3: cURL (From Terminal)

First, get your session cookie from browser:
1. Open DevTools → Application → Cookies → localhost:3300
2. Copy the `izzie2_session` cookie value

Then run:
```bash
# Start sync
curl -X POST http://localhost:3300/api/gmail/sync-user \
  -H "Content-Type: application/json" \
  -H "Cookie: izzie2_session=YOUR_COOKIE_VALUE" \
  -d '{
    "folder": "sent",
    "maxResults": 100
  }'

# Check status
curl http://localhost:3300/api/gmail/sync-user \
  -H "Cookie: izzie2_session=YOUR_COOKIE_VALUE"
```

## How It Works

```
User (logged in) → Browser Request with Session Cookie
                ↓
          /api/gmail/sync-user
                ↓
          requireAuth() ✓ (validates session)
                ↓
          getGoogleTokens(userId) (from accounts table)
                ↓
          Create OAuth2 Client with user tokens
                ↓
          Fetch emails from Gmail API
                ↓
          Emit Inngest events (izzie/ingestion.email.extracted)
                ↓
          Inngest handlers extract entities
                ↓
          Entities saved to database
```

## Monitoring

### 1. Watch Server Logs
```bash
# In your dev terminal
# Look for:
# [Gmail Sync User] User authenticated: ...
# [Gmail Sync User] Processed 1/100: ...
# [Gmail Sync User] Completed. Processed X emails
```

### 2. Check Inngest Dashboard
- Open Inngest dev server: `http://localhost:8288`
- Look for `izzie/ingestion.email.extracted` events
- Monitor entity extraction function runs

### 3. Query Database
```bash
# Check extracted entities
npm run db:studio
# Or query directly:
psql $DATABASE_URL -c "SELECT COUNT(*) FROM entities;"
```

## Troubleshooting

### "Unauthorized" Error
**Cause**: Not logged in or session expired

**Fix**:
1. Go to `http://localhost:3300`
2. Sign in with Google OAuth
3. Try again

### "No Google account linked"
**Cause**: User hasn't connected Google OAuth

**Fix**:
1. Sign out: `http://localhost:3300/api/auth/signout`
2. Sign back in with Google OAuth
3. Ensure you grant Gmail permissions

### "Invalid grant" or Token Expired
**Cause**: OAuth tokens are expired or invalid

**Fix**:
1. Sign out and sign back in
2. Check `accounts` table has valid `refreshToken`
3. Ensure `accessType: 'offline'` is set in OAuth config

### No Emails Found
**Check**:
- Are you filtering by the right folder?
- Try `folder: 'all'` to see all emails
- Check if `since` date is too recent
- Verify Gmail API is enabled in Google Cloud Console

### Rate Limit Errors
**Fix**:
- Reduce `maxResults` (try 50 or 25)
- Default has 100ms delay between emails
- Check Google Cloud Console quotas

## Next Steps

1. **Start with small batch**: Test with `maxResults: 10` first
2. **Check Inngest**: Verify extraction events are firing
3. **Query entities**: Confirm data is being saved
4. **Scale up**: Once working, increase to 100+ emails
5. **Automate**: Set up periodic syncs or webhooks

## Comparison: Service Account vs User OAuth

| Feature | Service Account | User OAuth (This Solution) |
|---------|----------------|---------------------------|
| Setup Complexity | High (domain-wide delegation) | Low (already set up) |
| Works With | Google Workspace only | Any Google account |
| Permissions | Requires admin approval | User grants directly |
| Token Refresh | Manual | Automatic |
| Best For | Enterprise/automated | Development/personal |

## Files Created

1. ✅ `src/app/api/gmail/sync-user/route.ts` - API endpoint
2. ✅ `trigger-user-sync.html` - Browser UI
3. ✅ `USER-AUTH-EXTRACTION-SOLUTION.md` - Detailed documentation
4. ✅ `EXTRACTION-QUICKSTART.md` - This guide

## Success Criteria

You'll know it's working when you see:

1. ✅ API responds with `"message": "Sync started with user OAuth tokens"`
2. ✅ Server logs show `[Gmail Sync User] Processed X/100: ...`
3. ✅ Inngest dashboard shows extraction events
4. ✅ Database has new entities from emails
5. ✅ Final status shows `"emailsProcessed": 100, "eventsSent": 100`

## Questions?

Check the detailed documentation in `USER-AUTH-EXTRACTION-SOLUTION.md` for:
- Full API endpoint code
- Architecture explanation
- Advanced troubleshooting
- Token refresh details
