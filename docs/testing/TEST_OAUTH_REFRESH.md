# Testing OAuth Token Refresh

## Test Scenario: Expired Access Token

This test demonstrates that the OAuth token refresh now works correctly.

### Setup
1. User has Google OAuth connected (has refresh_token in database)
2. User's access_token is expired (access_token_expires_at < NOW())

### Test Flow

#### 1. Check Current Token State
```sql
-- Query accounts table
SELECT 
  user_id,
  access_token_expires_at,
  CASE 
    WHEN access_token_expires_at < NOW() THEN 'EXPIRED'
    ELSE 'VALID'
  END as token_status,
  updated_at
FROM accounts
WHERE provider_id = 'google'
AND user_id = '<your-user-id>';
```

Expected: token_status = 'EXPIRED'

#### 2. Trigger Extraction from Dashboard
1. Navigate to `http://localhost:3300/dashboard/extraction`
2. Click "Start Extraction" button for Email
3. Watch browser network tab and server logs

#### 3. Observe Token Refresh in Logs
Server logs should show:
```
[Gmail Sync User] User authenticated: <userId> <userEmail>
[Gmail Sync User] Tokens refreshed for user: <userId>
[Auth] Updated Google OAuth tokens for user: <userId>
[Gmail Sync User] Fetching with query: after:<timestamp> in:sent
[Gmail Sync User] Progress tracking started: ...
```

Key indicators:
- ✅ "Tokens refreshed for user" - OAuth2Client auto-refreshed
- ✅ "Updated Google OAuth tokens" - New tokens saved to database
- ✅ Extraction continues successfully (no auth errors)

#### 4. Verify Database Updated
```sql
-- Check updated token
SELECT 
  access_token_expires_at,
  CASE 
    WHEN access_token_expires_at > NOW() THEN 'VALID'
    ELSE 'EXPIRED'
  END as token_status,
  updated_at,
  NOW() - updated_at as seconds_ago
FROM accounts
WHERE provider_id = 'google'
AND user_id = '<your-user-id>';
```

Expected:
- token_status = 'VALID' (now in future)
- updated_at = recent (within last few seconds)
- access_token_expires_at > NOW()

#### 5. Verify Extraction Progress
```sql
-- Check extraction progress
SELECT 
  source,
  status,
  processed_items,
  entities_extracted,
  last_run_at
FROM extraction_progress
WHERE user_id = '<your-user-id>'
AND source = 'email';
```

Expected:
- status = 'running' or 'completed'
- processed_items > 0
- entities_extracted > 0
- last_run_at = recent

## What Gets Tested

### ✅ Before Fix
- OAuth token expires
- Extraction fails with "Authentication required"
- User must manually re-authenticate
- Poor UX

### ✅ After Fix
- OAuth token expires
- OAuth2Client automatically refreshes using refresh_token
- New tokens saved to database via updateGoogleTokens()
- Extraction continues seamlessly
- Great UX

## Success Criteria

1. **No "Authentication required" errors** when tokens are expired
2. **Tokens automatically refresh** (visible in logs)
3. **Database updated** with new access_token and expiry
4. **Extraction completes** without manual intervention
5. **Subsequent requests use fresh tokens** from database

## Common Issues

### Issue: "No Google account linked"
**Cause**: User hasn't connected Google OAuth
**Fix**: Navigate to `/api/auth/signin/google` to authenticate

### Issue: "Failed to refresh token"
**Cause**: refresh_token is revoked or invalid
**Fix**: User must re-authenticate (revoke and re-grant access)

### Issue: Tokens refresh but extraction still fails
**Cause**: Different issue (API permissions, network, etc.)
**Check**: 
- Verify scopes include gmail.readonly
- Check network connectivity
- Review Gmail API quotas

## Code Flow Summary

```
User clicks "Start Extraction"
  ↓
POST /api/extraction/start
  ↓
Extract userId from session
  ↓
Forward to POST /api/gmail/sync-user (with cookies)
  ↓
getUserGmailClient(userId)
  ↓
getGoogleTokens(userId) - fetch from database
  ↓
OAuth2Client.setCredentials({
  access_token,
  refresh_token,
  expiry_date
})
  ↓
OAuth2Client checks expiry_date
  ↓
IF EXPIRED:
  OAuth2Client.refreshAccessToken()
    ↓
  Calls Google OAuth refresh endpoint
    ↓
  Gets new access_token and expiry_date
    ↓
  Emits 'tokens' event
    ↓
  updateGoogleTokens(userId, newTokens)
    ↓
  UPDATE accounts SET 
    access_token = ?,
    access_token_expires_at = ?,
    updated_at = NOW()
  WHERE user_id = ? AND provider_id = 'google'
  ↓
ENDIF
  ↓
Continue with Gmail API calls using valid token
  ↓
Extraction proceeds successfully
```

## Monitoring

Add monitoring for token refresh events:

```typescript
// In updateGoogleTokens()
console.log('[Auth] Token refresh metrics:', {
  userId,
  hasNewAccessToken: !!tokens.access_token,
  hasNewRefreshToken: !!tokens.refresh_token,
  newExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  timestamp: new Date().toISOString()
});
```

Track in analytics:
- Token refresh frequency per user
- Time to refresh (latency)
- Refresh failures (for revoked tokens)
- Correlation with extraction success rate
