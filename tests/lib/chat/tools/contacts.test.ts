/**
 * Contacts Chat Tools - Schema Validation Tests
 * Validates that all Zod schemas parse correctly
 */

import { describe, it, expect } from 'vitest';
import {
  searchContactsToolSchema,
  getContactDetailsToolSchema,
  syncContactsToolSchema,
  createContactToolSchema,
  updateContactToolSchema,
  deleteContactToolSchema,
} from '@/lib/chat/tools/contacts';

describe('Contacts Tool Schemas', () => {
  describe('searchContactsToolSchema', () => {
    it('should parse valid search params', () => {
      const valid = {
        query: 'john doe',
        limit: 10,
      };

      const result = searchContactsToolSchema.parse(valid);
      expect(result.query).toBe('john doe');
      expect(result.limit).toBe(10);
    });

    it('should use default limit if not provided', () => {
      const valid = {
        query: 'john doe',
      };

      const result = searchContactsToolSchema.parse(valid);
      expect(result.limit).toBe(10); // default value
    });

    it('should reject limit outside valid range', () => {
      const invalid = {
        query: 'test',
        limit: 100, // max is 50
      };

      expect(() => searchContactsToolSchema.parse(invalid)).toThrow();
    });
  });

  describe('getContactDetailsToolSchema', () => {
    it('should parse valid identifier', () => {
      const valid = {
        identifier: 'people/c1234567890',
      };

      const result = getContactDetailsToolSchema.parse(valid);
      expect(result.identifier).toBe('people/c1234567890');
    });

    it('should parse email as identifier', () => {
      const valid = {
        identifier: 'john@example.com',
      };

      const result = getContactDetailsToolSchema.parse(valid);
      expect(result.identifier).toBe('john@example.com');
    });
  });

  describe('syncContactsToolSchema', () => {
    it('should parse valid sync params', () => {
      const valid = {
        maxContacts: 500,
      };

      const result = syncContactsToolSchema.parse(valid);
      expect(result.maxContacts).toBe(500);
    });

    it('should use default maxContacts if not provided', () => {
      const result = syncContactsToolSchema.parse({});
      expect(result.maxContacts).toBe(100); // default value
    });
  });

  describe('createContactToolSchema', () => {
    it('should parse minimal valid contact (givenName only)', () => {
      const valid = {
        givenName: 'John',
      };

      const result = createContactToolSchema.parse(valid);
      expect(result.givenName).toBe('John');
      expect(result.familyName).toBeUndefined();
      expect(result.email).toBeUndefined();
    });

    it('should parse complete contact with all fields', () => {
      const valid = {
        givenName: 'John',
        familyName: 'Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        company: 'Acme Corp',
        jobTitle: 'Software Engineer',
        notes: 'Met at conference',
      };

      const result = createContactToolSchema.parse(valid);
      expect(result.givenName).toBe('John');
      expect(result.familyName).toBe('Doe');
      expect(result.email).toBe('john@example.com');
      expect(result.phone).toBe('+1234567890');
      expect(result.company).toBe('Acme Corp');
      expect(result.jobTitle).toBe('Software Engineer');
      expect(result.notes).toBe('Met at conference');
    });

    it('should reject empty givenName', () => {
      const invalid = {
        givenName: '',
      };

      expect(() => createContactToolSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid email format', () => {
      const invalid = {
        givenName: 'John',
        email: 'not-an-email',
      };

      expect(() => createContactToolSchema.parse(invalid)).toThrow();
    });
  });

  describe('updateContactToolSchema', () => {
    it('should parse update with only resourceName (no updates)', () => {
      const valid = {
        resourceName: 'people/c1234567890',
      };

      const result = updateContactToolSchema.parse(valid);
      expect(result.resourceName).toBe('people/c1234567890');
      expect(result.givenName).toBeUndefined();
    });

    it('should parse partial update', () => {
      const valid = {
        resourceName: 'people/c1234567890',
        givenName: 'Jane',
        email: 'jane@example.com',
      };

      const result = updateContactToolSchema.parse(valid);
      expect(result.resourceName).toBe('people/c1234567890');
      expect(result.givenName).toBe('Jane');
      expect(result.email).toBe('jane@example.com');
      expect(result.familyName).toBeUndefined();
    });

    it('should reject empty resourceName', () => {
      const invalid = {
        resourceName: '',
        givenName: 'John',
      };

      expect(() => updateContactToolSchema.parse(invalid)).toThrow();
    });
  });

  describe('deleteContactToolSchema', () => {
    it('should parse delete request with confirmation', () => {
      const valid = {
        resourceName: 'people/c1234567890',
        confirm: true,
      };

      const result = deleteContactToolSchema.parse(valid);
      expect(result.resourceName).toBe('people/c1234567890');
      expect(result.confirm).toBe(true);
    });

    it('should parse delete request without confirmation', () => {
      const valid = {
        resourceName: 'people/c1234567890',
        confirm: false,
      };

      const result = deleteContactToolSchema.parse(valid);
      expect(result.confirm).toBe(false);
    });

    it('should require resourceName', () => {
      const invalid = {
        confirm: true,
      };

      expect(() => deleteContactToolSchema.parse(invalid)).toThrow();
    });
  });

  describe('Schema toJSONSchema()', () => {
    it('should convert all schemas to JSON Schema', () => {
      // Test that Zod 4 built-in toJSONSchema() works for all schemas
      expect(searchContactsToolSchema.toJSONSchema()).toBeDefined();
      expect(getContactDetailsToolSchema.toJSONSchema()).toBeDefined();
      expect(syncContactsToolSchema.toJSONSchema()).toBeDefined();
      expect(createContactToolSchema.toJSONSchema()).toBeDefined();
      expect(updateContactToolSchema.toJSONSchema()).toBeDefined();
      expect(deleteContactToolSchema.toJSONSchema()).toBeDefined();
    });
  });
});
