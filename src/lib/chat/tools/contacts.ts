/**
 * Google Contacts Chat Tools
 * Enables users to search and manage Google Contacts through the chat interface
 */

import { z } from 'zod';
import { google } from 'googleapis';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { requireContactsAccess } from '@/lib/auth/scopes';
import { ContactsService } from '@/lib/google/contacts';
import type { Contact } from '@/lib/google/types';

const LOG_PREFIX = '[Contacts Tools]';

/**
 * Initialize OAuth2 client with user's tokens for Contacts access
 */
async function getContactsClient(userId: string): Promise<ContactsService> {
  const tokens = await getGoogleTokens(userId);
  if (!tokens) {
    throw new Error('No Google tokens found for user. Please connect your Google account.');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
      : 'http://localhost:3300/api/auth/callback/google'
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken || undefined,
    refresh_token: tokens.refreshToken || undefined,
    expiry_date: tokens.accessTokenExpiresAt
      ? new Date(tokens.accessTokenExpiresAt).getTime()
      : undefined,
  });

  // Auto-refresh tokens if needed
  oauth2Client.on('tokens', async (newTokens) => {
    console.log(`${LOG_PREFIX} Tokens refreshed for user:`, userId);
    await updateGoogleTokens(userId, newTokens);
  });

  return new ContactsService(oauth2Client);
}

/**
 * Format a contact for display
 */
function formatContact(contact: Contact, detailed: boolean = false): string {
  let result = `**${contact.displayName}**`;

  // Primary email
  const primaryEmail = contact.emails.find((e) => e.primary) || contact.emails[0];
  if (primaryEmail) {
    result += `\n  Email: ${primaryEmail.value}`;
  }

  // Primary phone
  const primaryPhone = contact.phoneNumbers.find((p) => p.primary) || contact.phoneNumbers[0];
  if (primaryPhone) {
    result += `\n  Phone: ${primaryPhone.value}`;
  }

  // Organization
  const org = contact.organizations[0];
  if (org) {
    if (org.title && org.name) {
      result += `\n  Work: ${org.title} at ${org.name}`;
    } else if (org.name) {
      result += `\n  Company: ${org.name}`;
    } else if (org.title) {
      result += `\n  Title: ${org.title}`;
    }
  }

  if (detailed) {
    // All emails
    if (contact.emails.length > 1) {
      result += '\n  All Emails:';
      contact.emails.forEach((e) => {
        result += `\n    - ${e.value} (${e.type}${e.primary ? ', primary' : ''})`;
      });
    }

    // All phone numbers
    if (contact.phoneNumbers.length > 1) {
      result += '\n  All Phones:';
      contact.phoneNumbers.forEach((p) => {
        result += `\n    - ${p.value} (${p.type}${p.primary ? ', primary' : ''})`;
      });
    }

    // Addresses
    if (contact.addresses.length > 0) {
      result += '\n  Addresses:';
      contact.addresses.forEach((a) => {
        result += `\n    - ${a.formattedValue} (${a.type})`;
      });
    }

    // Biography
    if (contact.biography) {
      result += `\n  Notes: ${contact.biography}`;
    }

    // Birthday
    const birthday = contact.birthdays[0]?.date;
    if (birthday && birthday.month && birthday.day) {
      const year = birthday.year ? `${birthday.year}-` : '';
      result += `\n  Birthday: ${year}${birthday.month}/${birthday.day}`;
    }

    // Resource name for reference
    result += `\n  ID: ${contact.resourceName}`;
  }

  return result;
}

/**
 * Search Contacts Tool
 * Search contacts by name, email, or company
 */
export const searchContactsToolSchema = z.object({
  query: z
    .string()
    .describe(
      'Search query to find contacts. Searches across name, email, phone, and company.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Maximum number of results to return (1-50)'),
});

export type SearchContactsParams = z.infer<typeof searchContactsToolSchema>;

export const searchContactsTool = {
  name: 'search_contacts',
  description:
    'Search your Google Contacts by name, email, phone number, or company. Returns matching contacts with their basic information.',
  parameters: searchContactsToolSchema,

  async execute(
    params: SearchContactsParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      // Check for Contacts access before any contacts operation
      await requireContactsAccess(userId);

      const validated = searchContactsToolSchema.parse(params);
      const contactsService = await getContactsClient(userId);

      // Fetch contacts and filter locally (Google People API doesn't have search)
      const allContacts = await contactsService.fetchAllContacts(500);
      const query = validated.query.toLowerCase();

      const matches = allContacts.filter((contact) => {
        const searchFields = [
          contact.displayName,
          contact.givenName,
          contact.familyName,
          ...contact.emails.map((e) => e.value),
          ...contact.phoneNumbers.map((p) => p.value),
          ...contact.organizations.map((o) => `${o.name} ${o.title || ''} ${o.department || ''}`),
        ]
          .filter(Boolean)
          .map((f) => f!.toLowerCase());

        return searchFields.some((field) => field.includes(query));
      });

      if (matches.length === 0) {
        return {
          message: `No contacts found matching "${validated.query}".`,
        };
      }

      const limitedMatches = matches.slice(0, validated.limit);
      const contactList = limitedMatches.map((c) => formatContact(c, false)).join('\n\n');

      let message = `**Found ${matches.length} contact(s) matching "${validated.query}"**`;
      if (matches.length > validated.limit) {
        message += ` (showing first ${validated.limit})`;
      }
      message += `:\n\n${contactList}`;

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Search contacts failed:`, error);
      throw new Error(
        `Failed to search contacts: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Get Contact Details Tool
 * Get full contact information by ID or email
 */
export const getContactDetailsToolSchema = z.object({
  identifier: z
    .string()
    .describe(
      'Contact identifier - either a resource name (e.g., "people/c1234567890") or an email address'
    ),
});

export type GetContactDetailsParams = z.infer<typeof getContactDetailsToolSchema>;

export const getContactDetailsTool = {
  name: 'get_contact_details',
  description:
    'Get full details of a contact by their ID (resource name like "people/c123") or email address. Returns all contact information including addresses, notes, and birthday.',
  parameters: getContactDetailsToolSchema,

  async execute(
    params: GetContactDetailsParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      // Check for Contacts access before any contacts operation
      await requireContactsAccess(userId);

      const validated = getContactDetailsToolSchema.parse(params);
      const contactsService = await getContactsClient(userId);
      const identifier = validated.identifier.trim();

      let contact: Contact | null = null;

      // Check if it's a resource name or email
      if (identifier.startsWith('people/')) {
        // Direct lookup by resource name
        contact = await contactsService.getContact(identifier);
      } else {
        // Search by email
        const allContacts = await contactsService.fetchAllContacts(500);
        contact = allContacts.find((c) =>
          c.emails.some((e) => e.value.toLowerCase() === identifier.toLowerCase())
        ) || null;
      }

      if (!contact) {
        return {
          message: `No contact found with identifier "${identifier}".`,
        };
      }

      const details = formatContact(contact, true);
      return {
        message: `**Contact Details**\n\n${details}`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Get contact details failed:`, error);
      throw new Error(
        `Failed to get contact details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Sync Contacts Tool
 * Trigger a contact sync and report status
 */
export const syncContactsToolSchema = z.object({
  maxContacts: z
    .number()
    .int()
    .min(10)
    .max(1000)
    .optional()
    .default(100)
    .describe('Maximum number of contacts to sync (10-1000)'),
});

export type SyncContactsParams = z.infer<typeof syncContactsToolSchema>;

export const syncContactsTool = {
  name: 'sync_contacts',
  description:
    'Sync contacts from Google Contacts. Fetches and reports the current state of your contacts.',
  parameters: syncContactsToolSchema,

  async execute(
    params: SyncContactsParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      // Check for Contacts access before any contacts operation
      await requireContactsAccess(userId);

      const validated = syncContactsToolSchema.parse(params);
      const contactsService = await getContactsClient(userId);

      console.log(`${LOG_PREFIX} Starting contact sync for user:`, userId);

      const contacts = await contactsService.fetchAllContacts(validated.maxContacts);

      // Calculate stats
      const withEmail = contacts.filter((c) => c.emails.length > 0).length;
      const withPhone = contacts.filter((c) => c.phoneNumbers.length > 0).length;
      const withOrg = contacts.filter((c) => c.organizations.length > 0).length;

      let message = `**Contact Sync Complete**\n\n`;
      message += `Total contacts synced: ${contacts.length}\n`;
      message += `- With email: ${withEmail}\n`;
      message += `- With phone: ${withPhone}\n`;
      message += `- With organization: ${withOrg}\n`;

      if (contacts.length >= validated.maxContacts) {
        message += `\n*Note: Reached max limit of ${validated.maxContacts}. You may have more contacts.*`;
      }

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Sync contacts failed:`, error);
      throw new Error(
        `Failed to sync contacts: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Create Contact Tool
 * Create a new contact in Google Contacts
 */
export const createContactToolSchema = z.object({
  givenName: z.string().min(1).describe('First name (required)'),
  familyName: z.string().optional().describe('Last name'),
  email: z.string().email().optional().describe('Email address'),
  phone: z.string().optional().describe('Phone number'),
  company: z.string().optional().describe('Company/organization name'),
  jobTitle: z.string().optional().describe('Job title'),
  notes: z.string().optional().describe('Notes/biography'),
});

export type CreateContactParams = z.infer<typeof createContactToolSchema>;

export const createContactTool = {
  name: 'create_contact',
  description:
    'Create a new contact in Google Contacts with name, email, phone, and organization details.',
  parameters: createContactToolSchema,

  async execute(
    params: CreateContactParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      // Check for Contacts access before any contacts operation
      await requireContactsAccess(userId);

      const validated = createContactToolSchema.parse(params);
      const contactsService = await getContactsClient(userId);

      console.log(`${LOG_PREFIX} Creating contact: ${validated.givenName} ${validated.familyName || ''} for user:`, userId);

      const result = await contactsService.createContact({
        givenName: validated.givenName,
        familyName: validated.familyName,
        email: validated.email,
        phone: validated.phone,
        organization: validated.company,
        title: validated.jobTitle,
        notes: validated.notes,
      });

      const displayName = `${validated.givenName}${validated.familyName ? ' ' + validated.familyName : ''}`;
      let message = `✓ Created contact: **${displayName}**`;

      if (validated.email) {
        message += `\n  Email: ${validated.email}`;
      }
      if (validated.phone) {
        message += `\n  Phone: ${validated.phone}`;
      }
      if (validated.company) {
        message += `\n  Company: ${validated.company}`;
      }
      if (validated.jobTitle) {
        message += `\n  Title: ${validated.jobTitle}`;
      }
      if (result.resourceName) {
        message += `\n  ID: ${result.resourceName}`;
      }

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Create contact failed:`, error);
      throw new Error(
        `Failed to create contact: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Update Contact Tool
 * Update an existing contact in Google Contacts
 */
export const updateContactToolSchema = z.object({
  resourceName: z.string().min(1).describe('Contact resource name (e.g., "people/c1234567890")'),
  givenName: z.string().optional().describe('First name'),
  familyName: z.string().optional().describe('Last name'),
  email: z.string().email().optional().describe('Email address'),
  phone: z.string().optional().describe('Phone number'),
  company: z.string().optional().describe('Company/organization name'),
  jobTitle: z.string().optional().describe('Job title'),
  notes: z.string().optional().describe('Notes/biography'),
});

export type UpdateContactParams = z.infer<typeof updateContactToolSchema>;

export const updateContactTool = {
  name: 'update_contact',
  description:
    'Update an existing contact in Google Contacts. Only provided fields will be updated (partial update).',
  parameters: updateContactToolSchema,

  async execute(
    params: UpdateContactParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      // Check for Contacts access before any contacts operation
      await requireContactsAccess(userId);

      const validated = updateContactToolSchema.parse(params);
      const contactsService = await getContactsClient(userId);

      console.log(`${LOG_PREFIX} Updating contact: ${validated.resourceName} for user:`, userId);

      // Build update data with only provided fields
      const updateData: {
        givenName?: string;
        familyName?: string;
        email?: string;
        phone?: string;
        organization?: string;
        title?: string;
        notes?: string;
      } = {};

      if (validated.givenName !== undefined) updateData.givenName = validated.givenName;
      if (validated.familyName !== undefined) updateData.familyName = validated.familyName;
      if (validated.email !== undefined) updateData.email = validated.email;
      if (validated.phone !== undefined) updateData.phone = validated.phone;
      if (validated.company !== undefined) updateData.organization = validated.company;
      if (validated.jobTitle !== undefined) updateData.title = validated.jobTitle;
      if (validated.notes !== undefined) updateData.notes = validated.notes;

      if (Object.keys(updateData).length === 0) {
        return {
          message: `⚠️ No updates provided for contact "${validated.resourceName}".`,
        };
      }

      await contactsService.updateContact(validated.resourceName, updateData);

      let message = `✓ Updated contact: **${validated.resourceName}**\n\nChanges:`;

      if (validated.givenName) message += `\n  • First Name: ${validated.givenName}`;
      if (validated.familyName) message += `\n  • Last Name: ${validated.familyName}`;
      if (validated.email) message += `\n  • Email: ${validated.email}`;
      if (validated.phone) message += `\n  • Phone: ${validated.phone}`;
      if (validated.company) message += `\n  • Company: ${validated.company}`;
      if (validated.jobTitle) message += `\n  • Job Title: ${validated.jobTitle}`;
      if (validated.notes) message += `\n  • Notes: ${validated.notes}`;

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Update contact failed:`, error);
      throw new Error(
        `Failed to update contact: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Delete Contact Tool
 * Delete a contact from Google Contacts with confirmation
 */
export const deleteContactToolSchema = z.object({
  resourceName: z.string().min(1).describe('Contact resource name (e.g., "people/c1234567890")'),
  confirm: z
    .boolean()
    .describe(
      'REQUIRED: Must be true to confirm deletion. This is a safety check to prevent accidental deletions.'
    ),
});

export type DeleteContactParams = z.infer<typeof deleteContactToolSchema>;

export const deleteContactTool = {
  name: 'delete_contact',
  description:
    'Delete a contact from Google Contacts. IMPORTANT: Requires explicit confirmation (confirm: true) to prevent accidental deletions.',
  parameters: deleteContactToolSchema,

  async execute(
    params: DeleteContactParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      // Check for Contacts access before any contacts operation
      await requireContactsAccess(userId);

      const validated = deleteContactToolSchema.parse(params);

      console.log(`${LOG_PREFIX} Delete request for contact: ${validated.resourceName} for user:`, userId);

      // Safety check: require explicit confirmation
      if (!validated.confirm) {
        return {
          message: `⚠️ **Deletion requires confirmation**\n\nTo delete contact "${validated.resourceName}", you must set confirm to true.\n\nExample: delete_contact({ resourceName: "${validated.resourceName}", confirm: true })`,
        };
      }

      const contactsService = await getContactsClient(userId);

      // First, get the contact to show what's being deleted
      const contact = await contactsService.getContact(validated.resourceName);

      if (!contact) {
        return {
          message: `❌ Contact not found: "${validated.resourceName}". Nothing to delete.`,
        };
      }

      // Delete the contact
      await contactsService.deleteContact(validated.resourceName);

      console.log(`${LOG_PREFIX} Deleted contact ${validated.resourceName} (user: ${userId})`);

      let message = `✓ Deleted contact: **${contact.displayName}**`;

      const primaryEmail = contact.emails.find((e) => e.primary) || contact.emails[0];
      if (primaryEmail) {
        message += `\n  Email: ${primaryEmail.value}`;
      }

      const primaryPhone = contact.phoneNumbers.find((p) => p.primary) || contact.phoneNumbers[0];
      if (primaryPhone) {
        message += `\n  Phone: ${primaryPhone.value}`;
      }

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Delete contact failed:`, error);
      throw new Error(
        `Failed to delete contact: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
