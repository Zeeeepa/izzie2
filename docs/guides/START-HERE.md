# 🚀 Email Extraction - START HERE

## The Absolute Easiest Way to Extract Emails

### Prerequisites
✅ You're logged in at `http://localhost:3300`
✅ You signed in with Google OAuth (has Gmail access)

---

## Method 1: Copy-Paste Script (30 seconds)

### Step 1: Open Browser Console
1. Go to `http://localhost:3300`
2. Press `F12` (or `Cmd+Option+I` on Mac)
3. Click the "Console" tab

### Step 2: Load the Script
Copy and paste this into the console:

```javascript
// Fetch and load the trigger script
await fetch('http://localhost:3300/trigger-sync.js')
  .then(r => r.text())
  .then(code => eval(code));
```

### Step 3: Start Extraction
Run this command:

```javascript
triggerSync()
```

That's it! Watch the console for progress updates.

### Want Different Settings?

```javascript
// Sync 50 inbox emails
triggerSync({ folder: 'inbox', maxResults: 50 })

// Sync all emails since Jan 1, 2024
triggerSync({ folder: 'all', maxResults: 200, since: '2024-01-01' })

// Check status anytime
checkSyncStatus()
```

---

## Method 2: HTML Interface (Visual)

### Step 1: Open the UI
Double-click `trigger-user-sync.html` in your file browser.

### Step 2: Configure
- Select folder (recommend "Sent")
- Set max emails (default 100)
- Optionally set a date

### Step 3: Click "Start Sync"
Watch real-time progress in the UI.

---

## Method 3: Direct Browser Console (No Script)

If the script doesn't work, paste this directly:

```javascript
// Start sync
fetch('http://localhost:3300/api/gmail/sync-user', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    folder: 'sent',
    maxResults: 100
  })
})
.then(res => res.json())
.then(data => {
  console.log('✅ Started:', data);

  // Monitor progress
  const interval = setInterval(async () => {
    const status = await fetch('http://localhost:3300/api/gmail/sync-user', {
      credentials: 'include'
    }).then(r => r.json());

    const { isRunning, emailsProcessed, eventsSent } = status.status;

    if (!isRunning && emailsProcessed > 0) {
      console.log(`✅ Done! ${emailsProcessed} emails, ${eventsSent} events`);
      clearInterval(interval);
    } else if (isRunning) {
      console.log(`📧 ${emailsProcessed} emails processed...`);
    }
  }, 2000);
});
```

---

## What Happens Next?

1. **Emails are fetched** from your Gmail using your OAuth tokens
2. **Events are sent** to Inngest for processing
3. **Entities are extracted** by the AI extraction service
4. **Data is saved** to your database

### Monitor Progress

**Server Logs**: Watch your dev terminal for:
```
[Gmail Sync User] Processed 1/100: Email subject...
[Gmail Sync User] Completed. Processed 100 emails
```

**Inngest Dashboard**: Open `http://localhost:8288`
- Look for `izzie/ingestion.email.extracted` events
- Check entity extraction function runs

**Database**: Query entities:
```bash
npm run db:studio
# Or:
psql $DATABASE_URL -c "SELECT * FROM entities LIMIT 10;"
```

---

## Troubleshooting

### "Unauthorized" Error
→ You're not logged in. Go to `http://localhost:3300` and sign in with Google.

### "No Google account linked"
→ Sign out and sign back in with Google OAuth. Make sure you grant Gmail permissions.

### No Emails Found
→ Try `folder: 'all'` or check if you have emails in that folder.

### Script Won't Load
→ Use Method 2 (HTML UI) or Method 3 (Direct Console) instead.

---

## Quick Test (5 emails)

Want to test with just 5 emails first?

```javascript
triggerSync({ maxResults: 5 })
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `trigger-sync.js` | Copy-paste script for browser console |
| `trigger-user-sync.html` | Visual UI for triggering sync |
| `EXTRACTION-QUICKSTART.md` | Detailed usage guide |
| `USER-AUTH-EXTRACTION-SOLUTION.md` | Technical documentation |
| `src/app/api/gmail/sync-user/route.ts` | API endpoint (already created) |

---

## Success Checklist

After running `triggerSync()`, you should see:

- [ ] ✅ "Sync started" message in console
- [ ] 📧 Progress updates every 2 seconds
- [ ] ✅ "Sync completed!" message
- [ ] 📊 Final stats (emails processed, events sent)
- [ ] 💾 New entities in database

---

## Need Help?

1. Check `EXTRACTION-QUICKSTART.md` for detailed instructions
2. Read `USER-AUTH-EXTRACTION-SOLUTION.md` for technical details
3. Look at server logs for error messages
4. Check Inngest dashboard for event processing

---

**You're all set!** Just pick a method above and run it. The easiest is Method 1 (copy-paste script).
