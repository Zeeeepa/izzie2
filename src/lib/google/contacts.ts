/**
 * Google Contacts Service
 * Provides methods to interact with Google People API (Contacts)
 */

import { google, Auth, people_v1 } from 'googleapis';
import type { Contact } from './types';

export class ContactsService {
  private people: people_v1.People;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.people = google.people({ version: 'v1', auth });
  }

  /**
   * Fetch user's contacts from Google People API
   */
  async fetchContacts(options: {
    pageSize?: number;
    pageToken?: string;
  } = {}): Promise<{
    contacts: Contact[];
    nextPageToken?: string;
    totalContacts: number;
  }> {
    const { pageSize = 100, pageToken } = options;

    try {
      const response = await this.people.people.connections.list({
        resourceName: 'people/me',
        pageSize,
        pageToken,
        personFields: [
          'names',
          'emailAddresses',
          'phoneNumbers',
          'organizations',
          'photos',
          'biographies',
          'addresses',
          'birthdays',
        ].join(','),
      });

      const connections = response.data.connections || [];

      // Map to our Contact type
      const contacts: Contact[] = connections
        .filter((person) => {
          // Only include contacts with at least a name or email
          const hasName = person.names && person.names.length > 0;
          const hasEmail = person.emailAddresses && person.emailAddresses.length > 0;
          return hasName || hasEmail;
        })
        .map((person) => {
          const primaryName = person.names?.[0];
          const primaryEmail = person.emailAddresses?.find((e) => e.metadata?.primary)
            || person.emailAddresses?.[0];
          const primaryPhone = person.phoneNumbers?.find((p) => p.metadata?.primary)
            || person.phoneNumbers?.[0];
          const primaryOrg = person.organizations?.[0];
          const primaryPhoto = person.photos?.find((p) => p.metadata?.primary)
            || person.photos?.[0];

          return {
            resourceName: person.resourceName || '',
            displayName: primaryName?.displayName || primaryEmail?.value || 'Unknown',
            givenName: primaryName?.givenName ?? undefined,
            familyName: primaryName?.familyName ?? undefined,
            emails: person.emailAddresses?.map((email) => ({
              value: email.value || '',
              type: email.type || 'other',
              primary: email.metadata?.primary || false,
            })) || [],
            phoneNumbers: person.phoneNumbers?.map((phone) => ({
              value: phone.value || '',
              type: phone.type || 'other',
              primary: phone.metadata?.primary || false,
            })) || [],
            organizations: person.organizations?.map((org) => ({
              name: org.name || '',
              title: org.title ?? undefined,
              department: org.department ?? undefined,
            })) || [],
            photoUrl: primaryPhoto?.url ?? undefined,
            biography: person.biographies?.[0]?.value ?? undefined,
            addresses: person.addresses?.map((addr) => ({
              formattedValue: addr.formattedValue || '',
              type: addr.type || 'other',
              city: addr.city ?? undefined,
              region: addr.region ?? undefined,
              country: addr.country ?? undefined,
            })) || [],
            birthdays: person.birthdays?.map((bday) => ({
              date: bday.date ? {
                year: bday.date.year || undefined,
                month: bday.date.month || undefined,
                day: bday.date.day || undefined,
              } : undefined,
            })) || [],
          };
        });

      return {
        contacts,
        nextPageToken: response.data.nextPageToken || undefined,
        totalContacts: response.data.totalPeople || contacts.length,
      };
    } catch (error) {
      console.error('[Contacts] Failed to fetch contacts:', error);
      throw error;
    }
  }

  /**
   * Fetch all contacts with pagination
   */
  async fetchAllContacts(maxContacts: number = 1000): Promise<Contact[]> {
    const allContacts: Contact[] = [];
    let pageToken: string | undefined;
    let totalFetched = 0;

    try {
      do {
        const batch = await this.fetchContacts({
          pageSize: Math.min(100, maxContacts - totalFetched),
          pageToken,
        });

        allContacts.push(...batch.contacts);
        totalFetched += batch.contacts.length;
        pageToken = batch.nextPageToken;

        console.log(`[Contacts] Fetched ${totalFetched} contacts so far...`);

        // Stop if we've reached max contacts
        if (totalFetched >= maxContacts) {
          break;
        }
      } while (pageToken);

      console.log(`[Contacts] Total contacts fetched: ${allContacts.length}`);
      return allContacts;
    } catch (error) {
      console.error('[Contacts] Failed to fetch all contacts:', error);
      throw error;
    }
  }

  /**
   * Get a specific contact by resource name
   */
  async getContact(resourceName: string): Promise<Contact | null> {
    try {
      const response = await this.people.people.get({
        resourceName,
        personFields: [
          'names',
          'emailAddresses',
          'phoneNumbers',
          'organizations',
          'photos',
          'biographies',
          'addresses',
          'birthdays',
        ].join(','),
      });

      const person = response.data;
      const primaryName = person.names?.[0];
      const primaryEmail = person.emailAddresses?.find((e) => e.metadata?.primary)
        || person.emailAddresses?.[0];
      const primaryPhoto = person.photos?.find((p) => p.metadata?.primary)
        || person.photos?.[0];

      return {
        resourceName: person.resourceName || '',
        displayName: primaryName?.displayName || primaryEmail?.value || 'Unknown',
        givenName: primaryName?.givenName ?? undefined,
        familyName: primaryName?.familyName ?? undefined,
        emails: person.emailAddresses?.map((email) => ({
          value: email.value || '',
          type: email.type || 'other',
          primary: email.metadata?.primary || false,
        })) || [],
        phoneNumbers: person.phoneNumbers?.map((phone) => ({
          value: phone.value || '',
          type: phone.type || 'other',
          primary: phone.metadata?.primary || false,
        })) || [],
        organizations: person.organizations?.map((org) => ({
          name: org.name || '',
          title: org.title ?? undefined,
          department: org.department ?? undefined,
        })) || [],
        photoUrl: primaryPhoto?.url ?? undefined,
        biography: person.biographies?.[0]?.value ?? undefined,
        addresses: person.addresses?.map((addr) => ({
          formattedValue: addr.formattedValue || '',
          type: addr.type || 'other',
          city: addr.city ?? undefined,
          region: addr.region ?? undefined,
          country: addr.country ?? undefined,
        })) || [],
        birthdays: person.birthdays?.map((bday) => ({
          date: bday.date ? {
            year: bday.date.year || undefined,
            month: bday.date.month || undefined,
            day: bday.date.day || undefined,
          } : undefined,
        })) || [],
      };
    } catch (error) {
      console.error('[Contacts] Failed to get contact:', error);
      return null;
    }
  }

  /**
   * Create a new contact in Google Contacts
   */
  async createContact(data: {
    givenName: string;
    familyName?: string;
    email?: string;
    phone?: string;
    organization?: string;
    title?: string;
    notes?: string;
  }): Promise<people_v1.Schema$Person> {
    try {
      const person: people_v1.Schema$Person = {
        names: [
          {
            givenName: data.givenName,
            familyName: data.familyName,
          },
        ],
      };

      // Add email if provided
      if (data.email) {
        person.emailAddresses = [
          {
            value: data.email,
            type: 'work',
          },
        ];
      }

      // Add phone if provided
      if (data.phone) {
        person.phoneNumbers = [
          {
            value: data.phone,
            type: 'mobile',
          },
        ];
      }

      // Add organization if provided
      if (data.organization || data.title) {
        person.organizations = [
          {
            name: data.organization,
            title: data.title,
          },
        ];
      }

      // Add notes/biography if provided
      if (data.notes) {
        person.biographies = [
          {
            value: data.notes,
            contentType: 'TEXT_PLAIN',
          },
        ];
      }

      const response = await this.people.people.createContact({
        requestBody: person,
        personFields: [
          'names',
          'emailAddresses',
          'phoneNumbers',
          'organizations',
          'biographies',
        ].join(','),
      });

      console.log(`[Contacts] Created contact: ${response.data.resourceName}`);
      return response.data;
    } catch (error) {
      console.error('[Contacts] Failed to create contact:', error);
      throw error;
    }
  }

  /**
   * Update an existing contact in Google Contacts
   */
  async updateContact(
    resourceName: string,
    data: {
      givenName?: string;
      familyName?: string;
      email?: string;
      phone?: string;
      organization?: string;
      title?: string;
      notes?: string;
    },
    etag?: string
  ): Promise<people_v1.Schema$Person> {
    try {
      // First, get the current contact to get the etag if not provided
      const current = await this.people.people.get({
        resourceName,
        personFields: [
          'names',
          'emailAddresses',
          'phoneNumbers',
          'organizations',
          'biographies',
          'metadata',
        ].join(','),
      });

      const updatePersonFields: string[] = [];
      const person: people_v1.Schema$Person = {
        etag: etag || current.data.etag,
      };

      // Update names if provided
      if (data.givenName || data.familyName) {
        person.names = [
          {
            givenName: data.givenName || current.data.names?.[0]?.givenName,
            familyName: data.familyName || current.data.names?.[0]?.familyName,
          },
        ];
        updatePersonFields.push('names');
      }

      // Update email if provided
      if (data.email) {
        person.emailAddresses = [
          {
            value: data.email,
            type: 'work',
          },
        ];
        updatePersonFields.push('emailAddresses');
      }

      // Update phone if provided
      if (data.phone) {
        person.phoneNumbers = [
          {
            value: data.phone,
            type: 'mobile',
          },
        ];
        updatePersonFields.push('phoneNumbers');
      }

      // Update organization if provided
      if (data.organization || data.title) {
        person.organizations = [
          {
            name: data.organization || current.data.organizations?.[0]?.name,
            title: data.title || current.data.organizations?.[0]?.title,
          },
        ];
        updatePersonFields.push('organizations');
      }

      // Update notes/biography if provided
      if (data.notes) {
        person.biographies = [
          {
            value: data.notes,
            contentType: 'TEXT_PLAIN',
          },
        ];
        updatePersonFields.push('biographies');
      }

      if (updatePersonFields.length === 0) {
        console.log('[Contacts] No fields to update');
        return current.data;
      }

      const response = await this.people.people.updateContact({
        resourceName,
        updatePersonFields: updatePersonFields.join(','),
        requestBody: person,
        personFields: [
          'names',
          'emailAddresses',
          'phoneNumbers',
          'organizations',
          'biographies',
        ].join(','),
      });

      console.log(`[Contacts] Updated contact: ${resourceName}`);
      return response.data;
    } catch (error) {
      console.error('[Contacts] Failed to update contact:', error);
      throw error;
    }
  }

  /**
   * Find a contact by email address
   */
  async findContactByEmail(email: string): Promise<people_v1.Schema$Person | null> {
    try {
      // Search using the People API searchContacts method
      const response = await this.people.people.searchContacts({
        query: email,
        readMask: [
          'names',
          'emailAddresses',
          'phoneNumbers',
          'organizations',
          'photos',
          'biographies',
        ].join(','),
        pageSize: 10,
      });

      const results = response.data.results || [];

      // Find exact email match
      for (const result of results) {
        const person = result.person;
        if (person?.emailAddresses) {
          for (const emailAddr of person.emailAddresses) {
            if (emailAddr.value?.toLowerCase() === email.toLowerCase()) {
              console.log(`[Contacts] Found contact by email: ${person.resourceName}`);
              return person;
            }
          }
        }
      }

      console.log(`[Contacts] No contact found for email: ${email}`);
      return null;
    } catch (error) {
      console.error('[Contacts] Failed to search contacts:', error);
      throw error;
    }
  }

  /**
   * Delete a contact from Google Contacts
   */
  async deleteContact(resourceName: string): Promise<void> {
    try {
      await this.people.people.deleteContact({
        resourceName,
      });

      console.log(`[Contacts] Deleted contact: ${resourceName}`);
    } catch (error) {
      console.error('[Contacts] Failed to delete contact:', error);
      throw error;
    }
  }
}

/**
 * Factory function to create ContactsService instance
 */
export async function getContactsService(
  auth: Auth.GoogleAuth | Auth.OAuth2Client
): Promise<ContactsService> {
  return new ContactsService(auth);
}
