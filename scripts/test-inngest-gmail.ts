/**
 * Test script to verify Inngest Gmail extraction can find users
 * Run: npx tsx scripts/test-inngest-gmail.ts
 */

import { dbClient } from '@/lib/db';
import { users, accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function testGetUsersWithGmail() {
  console.log('\n🔍 Testing getUsersWithGmail query...\n');

  try {
    const db = dbClient.getDb();

    // Same query as in ingest-emails.ts
    const usersWithGoogle = await db
      .select({
        userId: users.id,
        email: users.email,
        accessToken: accounts.accessToken,
        refreshToken: accounts.refreshToken,
        accessTokenExpiresAt: accounts.accessTokenExpiresAt,
      })
      .from(users)
      .innerJoin(accounts, eq(users.id, accounts.userId))
      .where(eq(accounts.providerId, 'google'));

    console.log(`✅ Found ${usersWithGoogle.length} users with Gmail connected\n`);

    if (usersWithGoogle.length === 0) {
      console.log('⚠️  No users found with Gmail OAuth.');
      console.log('   Make sure to:');
      console.log('   1. Sign in with Google OAuth');
      console.log('   2. Check accounts table has providerId="google"');
      console.log('   3. Verify OAuth tokens are saved\n');
      return;
    }

    // Show details for each user
    for (const user of usersWithGoogle) {
      console.log('👤 User:', user.email);
      console.log('   User ID:', user.userId);
      console.log('   Has Access Token:', !!user.accessToken);
      console.log('   Has Refresh Token:', !!user.refreshToken);
      console.log('   Token Expires:', user.accessTokenExpiresAt?.toISOString() || 'N/A');

      const now = new Date();
      const isExpired = user.accessTokenExpiresAt && user.accessTokenExpiresAt < now;
      console.log('   Token Status:', isExpired ? '⚠️ EXPIRED' : '✅ Valid');

      if (!user.accessToken && !user.refreshToken) {
        console.log('   ⚠️ WARNING: No valid OAuth tokens!');
      }

      console.log('');
    }

    console.log('✅ Test completed successfully\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run the test
testGetUsersWithGmail()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
