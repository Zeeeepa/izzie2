/**
 * Test Google Contacts Sync
 *
 * Tests the contacts sync functionality by:
 * 1. Fetching user's Google contacts
 * 2. Converting contacts to entities
 * 3. Saving to Weaviate
 *
 * Usage (without userId - basic validation):
 *   bun run scripts/test-contacts-sync.ts
 *
 * Usage (with userId - full sync test):
 *   bun run scripts/test-contacts-sync.ts <userId>
 */

import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { google } from 'googleapis';
import { getContactsService } from '@/lib/google/contacts';
import { saveEntities } from '@/lib/weaviate/entities';
import type { Entity } from '@/lib/extraction/types';
import type { Contact } from '@/lib/google/types';

async function testContactsSync(userId: string) {
  console.log(`\n[Test] Starting contacts sync test for user: ${userId}\n`);

  try {
    // Get Google OAuth tokens
    console.log('[Test] Fetching Google OAuth tokens...');
    const tokens = await getGoogleTokens(userId);

    if (!tokens.accessToken) {
      throw new Error('No Google access token found. User needs to authenticate with Google first.');
    }

    console.log('[Test] ✓ Found access token');

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken || undefined,
    });

    // Set up token refresh callback
    oauth2Client.on('tokens', async (newTokens) => {
      console.log('[Test] OAuth tokens refreshed automatically');
      await updateGoogleTokens(userId, newTokens);
    });

    // Initialize Contacts Service
    console.log('\n[Test] Initializing Contacts Service...');
    const contactsService = await getContactsService(oauth2Client);
    console.log('[Test] ✓ Contacts Service initialized');

    // Fetch first page of contacts (limit to 10 for testing)
    console.log('\n[Test] Fetching contacts (max 10 for testing)...');
    const { contacts, totalContacts, nextPageToken } = await contactsService.fetchContacts({
      pageSize: 10,
    });

    console.log(`[Test] ✓ Fetched ${contacts.length} contacts`);
    console.log(`[Test] Total contacts available: ${totalContacts}`);
    console.log(`[Test] Has more pages: ${!!nextPageToken}`);

    if (contacts.length === 0) {
      console.log('\n[Test] ⚠️  No contacts found. User may not have any contacts in Google Contacts.');
      return;
    }

    // Display sample contact
    console.log('\n[Test] Sample contact:');
    const sampleContact = contacts[0];
    console.log(JSON.stringify({
      displayName: sampleContact.displayName,
      emails: sampleContact.emails.slice(0, 2),
      organizations: sampleContact.organizations.slice(0, 1),
    }, null, 2));

    // Convert contacts to entities
    console.log('\n[Test] Converting contacts to entities...');
    const entities = convertContactsToEntities(contacts);
    console.log(`[Test] ✓ Converted to ${entities.length} entities`);

    // Display entity types breakdown
    const entityTypes = entities.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log('[Test] Entity types:', entityTypes);

    // Display sample entities
    console.log('\n[Test] Sample entities:');
    entities.slice(0, 3).forEach((entity) => {
      console.log(`  - ${entity.type}: ${entity.value} (confidence: ${entity.confidence})`);
    });

    // Save entities to Weaviate
    console.log('\n[Test] Saving entities to Weaviate...');
    await saveEntities(entities, userId, 'contacts-sync-test');
    console.log('[Test] ✓ Entities saved successfully');

    console.log('\n[Test] ✅ Contacts sync test completed successfully!\n');
  } catch (error) {
    console.error('\n[Test] ❌ Test failed:', error);
    throw error;
  }
}

async function testBasicSetup() {
  console.log('🧪 Testing Google Contacts Service Setup...\n');

  // Check if credentials are available
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    console.error('   Set these in .env.local to test contacts sync');
    process.exit(1);
  }

  console.log('✅ OAuth credentials found');
  console.log('   Client ID:', clientId.substring(0, 20) + '...');

  // Create a mock OAuth2 client (won't actually work without tokens)
  // This is just to test that the service instantiates correctly
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);

  try {
    console.log('\n📋 Creating ContactsService...');
    const contactsService = await getContactsService(oauth2Client);
    console.log('✅ ContactsService created successfully');
    console.log('   Type:', typeof contactsService);
    console.log('   Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(contactsService)));
  } catch (error) {
    console.error('❌ Failed to create ContactsService:', error);
    process.exit(1);
  }

  console.log('\n✨ All basic tests passed!');
  console.log('\n📝 Next steps:');
  console.log('   1. Ensure People API is enabled in Google Cloud Console');
  console.log('   2. Verify contacts.readonly scope in OAuth consent screen');
  console.log('   3. Re-authenticate users to grant contacts permission');
  console.log('   4. Run with userId: bun run scripts/test-contacts-sync.ts <userId>');
  console.log('   5. Or call POST /api/contacts/sync to sync contacts via API');
}

/**
 * Convert Google Contacts to Person entities
 */
function convertContactsToEntities(contacts: Contact[]): Entity[] {
  const entities: Entity[] = [];

  for (const contact of contacts) {
    // Create Person entity with high confidence (these are user's saved contacts)
    const personEntity: Entity = {
      type: 'person',
      value: contact.displayName,
      normalized: normalizeContactName(contact),
      confidence: 0.95, // High confidence for saved contacts
      source: 'metadata',
      context: buildContactContext(contact),
    };

    entities.push(personEntity);

    // Add company entities from organizations
    for (const org of contact.organizations) {
      if (org.name) {
        entities.push({
          type: 'company',
          value: org.name,
          normalized: org.name.toLowerCase().trim(),
          confidence: 0.9,
          source: 'metadata',
          context: `${contact.displayName} works at ${org.name}${org.title ? ` as ${org.title}` : ''}`,
        });
      }
    }
  }

  return entities;
}

/**
 * Normalize contact name for entity matching
 */
function normalizeContactName(contact: Contact): string {
  if (contact.givenName && contact.familyName) {
    return `${contact.givenName} ${contact.familyName}`.toLowerCase().trim();
  }
  return contact.displayName.toLowerCase().trim();
}

/**
 * Build context string for contact entity
 */
function buildContactContext(contact: Contact): string {
  const parts: string[] = [];

  // Add primary email
  const primaryEmail = contact.emails.find((e) => e.primary) || contact.emails[0];
  if (primaryEmail) {
    parts.push(`Email: ${primaryEmail.value}`);
  }

  // Add primary phone
  const primaryPhone = contact.phoneNumbers.find((p) => p.primary) || contact.phoneNumbers[0];
  if (primaryPhone) {
    parts.push(`Phone: ${primaryPhone.value}`);
  }

  // Add organization
  if (contact.organizations.length > 0) {
    const org = contact.organizations[0];
    if (org.title && org.name) {
      parts.push(`${org.title} at ${org.name}`);
    } else if (org.name) {
      parts.push(org.name);
    }
  }

  return parts.join(' | ');
}

// Main execution
const userId = process.argv[2];

if (userId) {
  testContactsSync(userId).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
} else {
  testBasicSetup().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
