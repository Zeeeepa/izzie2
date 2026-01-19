/**
 * Quick Email Sync Trigger Script
 *
 * Usage:
 * 1. Make sure you're logged in at http://localhost:3300
 * 2. Open browser console at localhost:3300
 * 3. Copy and paste this entire script
 * 4. Run: triggerSync({ folder: 'sent', maxResults: 100 })
 */

async function triggerSync(options = {}) {
  const {
    folder = 'sent',      // 'sent', 'inbox', or 'all'
    maxResults = 100,     // Number of emails to process
    since = null,         // Optional: '2024-01-01' format
  } = options;

  console.log('🚀 Starting Gmail sync...');
  console.log('Config:', { folder, maxResults, since });

  try {
    // Start sync
    const response = await fetch('http://localhost:3300/api/gmail/sync-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include session cookie
      body: JSON.stringify({
        folder,
        maxResults,
        ...(since && { since }),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.details || 'Unknown error');
    }

    console.log('✅ Sync started:', result);
    console.log('User:', result.userEmail);
    console.log('Folder:', folder);
    console.log('Max emails:', maxResults);

    // Start status monitoring
    let lastEmailsProcessed = 0;
    let lastEventsSent = 0;

    const statusInterval = setInterval(async () => {
      try {
        const statusRes = await fetch('http://localhost:3300/api/gmail/sync-user', {
          credentials: 'include',
        });

        const statusData = await statusRes.json();
        const { isRunning, emailsProcessed, eventsSent, error } = statusData.status;

        if (error) {
          console.error('❌ Sync failed:', error);
          clearInterval(statusInterval);
          return;
        }

        if (isRunning) {
          // Show progress if changed
          if (emailsProcessed !== lastEmailsProcessed || eventsSent !== lastEventsSent) {
            console.log(`📧 Progress: ${emailsProcessed} emails processed, ${eventsSent} extraction events sent`);
            lastEmailsProcessed = emailsProcessed;
            lastEventsSent = eventsSent;
          }
        } else if (emailsProcessed > 0) {
          console.log('✅ Sync completed!');
          console.log(`📊 Final stats: ${emailsProcessed} emails processed, ${eventsSent} extraction events sent`);
          console.log('💡 Check Inngest dashboard for extraction results: http://localhost:8288');
          clearInterval(statusInterval);
        }
      } catch (err) {
        console.error('Status check error:', err.message);
      }
    }, 2000);

    console.log('⏳ Monitoring sync progress... (check console for updates)');

    return {
      message: 'Sync started successfully',
      stopMonitoring: () => {
        clearInterval(statusInterval);
        console.log('🛑 Stopped monitoring');
      }
    };

  } catch (error) {
    console.error('❌ Error starting sync:', error.message);

    if (error.message.includes('Unauthorized')) {
      console.log('💡 You need to log in first:');
      console.log('   1. Go to http://localhost:3300');
      console.log('   2. Sign in with Google');
      console.log('   3. Try running triggerSync() again');
    } else if (error.message.includes('No Google account')) {
      console.log('💡 No Google account linked:');
      console.log('   1. Sign out: http://localhost:3300/api/auth/signout');
      console.log('   2. Sign in with Google OAuth');
      console.log('   3. Grant Gmail permissions');
      console.log('   4. Try again');
    }

    throw error;
  }
}

// Quick check function
async function checkSyncStatus() {
  try {
    const response = await fetch('http://localhost:3300/api/gmail/sync-user', {
      credentials: 'include',
    });

    const result = await response.json();

    if (result.status) {
      console.log('📊 Current status:', result.status);
      return result.status;
    }
  } catch (error) {
    console.error('Error checking status:', error.message);
  }
}

// Export for use
console.log('✅ Email sync functions loaded!');
console.log('');
console.log('Usage:');
console.log('  triggerSync()                                    - Sync 100 sent emails');
console.log('  triggerSync({ folder: "inbox", maxResults: 50 }) - Sync 50 inbox emails');
console.log('  triggerSync({ folder: "all", maxResults: 200 })  - Sync 200 emails from all folders');
console.log('  checkSyncStatus()                                - Check current sync status');
console.log('');
console.log('Options:');
console.log('  folder: "sent" | "inbox" | "all" (default: "sent")');
console.log('  maxResults: number (default: 100, max: 500)');
console.log('  since: "YYYY-MM-DD" (optional, e.g., "2024-01-01")');
console.log('');

// Make functions available globally
window.triggerSync = triggerSync;
window.checkSyncStatus = checkSyncStatus;
