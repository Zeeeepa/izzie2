/**
 * Contacts Sync Service
 *
 * Syncs discovered Person entities from onboarding to Google Contacts.
 * Creates new contacts or updates existing ones based on email matching.
 */

import { Auth, people_v1 } from 'googleapis';
import { ContactsService } from '@/lib/google/contacts';
import type { DiscoveredEntity } from '../types';
import type { Entity } from '@/lib/extraction/types';

const LOG_PREFIX = '[ContactsSync]';

export type ContactSyncAction = 'created' | 'updated' | 'skipped';

export interface ContactSyncResult {
  action: ContactSyncAction;
  resourceName?: string;
  error?: string;
}

export interface ContactSyncSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

/**
 * Parse a person entity value into name parts
 * Handles formats like "John Doe", "Doe, John", "John"
 */
function parsePersonName(value: string): { givenName: string; familyName?: string } {
  const trimmed = value.trim();

  // Handle "LastName, FirstName" format
  if (trimmed.includes(',')) {
    const [familyName, givenName] = trimmed.split(',').map((s) => s.trim());
    return { givenName: givenName || familyName, familyName: givenName ? familyName : undefined };
  }

  // Handle "FirstName LastName" format
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { givenName: parts[0] };
  }

  // First part is given name, rest is family name
  const [givenName, ...rest] = parts;
  return { givenName, familyName: rest.join(' ') };
}

/**
 * Extract email from entity context or related entities
 */
function extractEmailFromEntity(entity: Entity | DiscoveredEntity): string | undefined {
  // Check context for email patterns
  if (entity.context) {
    const emailMatch = entity.context.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) {
      return emailMatch[0];
    }
  }
  return undefined;
}

/**
 * Sync a single Person entity to Google Contacts
 */
export async function syncEntityToContacts(
  auth: Auth.OAuth2Client,
  entity: Entity | DiscoveredEntity,
  relatedEmail?: string
): Promise<ContactSyncResult> {
  // Only sync person entities
  if (entity.type !== 'person') {
    return { action: 'skipped', error: 'Not a person entity' };
  }

  try {
    const contactsService = new ContactsService(auth);
    const { givenName, familyName } = parsePersonName(entity.value);

    // Try to find email for this person
    const email = relatedEmail || extractEmailFromEntity(entity);

    // If we have an email, check if contact already exists
    if (email) {
      const existing = await contactsService.findContactByEmail(email);

      if (existing && existing.resourceName) {
        // Update existing contact
        console.log(`${LOG_PREFIX} Updating existing contact for ${email}`);
        const updated = await contactsService.updateContact(existing.resourceName, {
          givenName,
          familyName,
          notes: `Discovered via email analysis. Seen ${(entity as DiscoveredEntity).occurrenceCount || 1} times.`,
        });

        return {
          action: 'updated',
          resourceName: updated.resourceName || undefined,
        };
      }
    }

    // Create new contact
    console.log(`${LOG_PREFIX} Creating new contact: ${entity.value}`);
    const created = await contactsService.createContact({
      givenName,
      familyName,
      email,
      notes: `Discovered via email analysis. Seen ${(entity as DiscoveredEntity).occurrenceCount || 1} times.`,
    });

    return {
      action: 'created',
      resourceName: created.resourceName || undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} Failed to sync entity:`, error);
    return {
      action: 'skipped',
      error: errorMessage,
    };
  }
}

/**
 * Sync multiple Person entities to Google Contacts
 */
export async function syncEntitiesToContacts(
  auth: Auth.OAuth2Client,
  entities: Array<Entity | DiscoveredEntity>,
  emailMap?: Map<string, string> // Map of entity value to email
): Promise<{
  results: Map<string, ContactSyncResult>;
  summary: ContactSyncSummary;
}> {
  const results = new Map<string, ContactSyncResult>();
  const summary: ContactSyncSummary = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  // Filter to only person entities
  const personEntities = entities.filter((e) => e.type === 'person');
  summary.total = personEntities.length;

  console.log(`${LOG_PREFIX} Syncing ${personEntities.length} person entities to contacts`);

  for (const entity of personEntities) {
    const relatedEmail = emailMap?.get(entity.value);
    const result = await syncEntityToContacts(auth, entity, relatedEmail);

    results.set(entity.value, result);

    switch (result.action) {
      case 'created':
        summary.created++;
        break;
      case 'updated':
        summary.updated++;
        break;
      case 'skipped':
        summary.skipped++;
        if (result.error) {
          summary.errors++;
        }
        break;
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(
    `${LOG_PREFIX} Sync complete: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`
  );

  return { results, summary };
}

/**
 * Batch sync with progress callback
 */
export async function syncEntitiesWithProgress(
  auth: Auth.OAuth2Client,
  entities: Array<Entity | DiscoveredEntity>,
  onProgress?: (current: number, total: number, result: ContactSyncResult) => void,
  emailMap?: Map<string, string>
): Promise<ContactSyncSummary> {
  const personEntities = entities.filter((e) => e.type === 'person');
  const summary: ContactSyncSummary = {
    total: personEntities.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  console.log(`${LOG_PREFIX} Starting batch sync of ${personEntities.length} entities`);

  for (let i = 0; i < personEntities.length; i++) {
    const entity = personEntities[i];
    const relatedEmail = emailMap?.get(entity.value);
    const result = await syncEntityToContacts(auth, entity, relatedEmail);

    switch (result.action) {
      case 'created':
        summary.created++;
        break;
      case 'updated':
        summary.updated++;
        break;
      case 'skipped':
        summary.skipped++;
        if (result.error) {
          summary.errors++;
        }
        break;
    }

    if (onProgress) {
      onProgress(i + 1, personEntities.length, result);
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return summary;
}
