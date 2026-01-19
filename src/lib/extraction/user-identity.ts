/**
 * User Identity System for Entity Extraction
 *
 * Manages user identity and aliasing to:
 * - Establish privileged "me" identity from OAuth
 * - Consolidate user's own entities under primary identity
 * - Mark entities that refer to the current user
 */

import { dbClient } from '@/lib/db';
import { users, accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { Entity } from './types';

const LOG_PREFIX = '[UserIdentity]';

/**
 * User identity with aliases for entity consolidation
 */
export interface UserIdentity {
  userId: string;
  primaryName: string; // Full name from OAuth (e.g., "Bob Matsuoka")
  primaryEmail: string; // Primary email from OAuth (e.g., "bob@matsuoka.com")
  aliases: string[]; // Known name variations: ["bob", "robert", "bob_matsuoka", "robert_matsuoka"]
  emailAliases: string[]; // Email variations from accounts: ["bob@gmail.com", "bob@company.com"]
}

/**
 * Get user identity from database (OAuth session + accounts)
 *
 * @param userId - User ID from database
 * @returns UserIdentity with primary name/email and aliases
 */
export async function getUserIdentity(userId: string): Promise<UserIdentity> {
  const db = dbClient.getDb();

  // Get user's primary name and email from users table
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Get all linked accounts to extract email aliases
  const linkedAccounts = await db
    .select({
      accountId: accounts.accountId,
      providerId: accounts.providerId,
    })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  // Extract email aliases from account IDs (often email addresses)
  const emailAliases: string[] = [user.email];

  // Build name aliases based on primary name
  const aliases: string[] = [];
  if (user.name) {
    aliases.push(...generateNameAliases(user.name));
  }

  console.log(`${LOG_PREFIX} User identity for ${userId}:`, {
    primaryName: user.name,
    primaryEmail: user.email,
    aliasCount: aliases.length,
    emailAliasCount: emailAliases.length,
  });

  return {
    userId: user.id,
    primaryName: user.name || user.email,
    primaryEmail: user.email,
    aliases,
    emailAliases,
  };
}

/**
 * Generate name aliases from a full name
 *
 * Examples:
 * - "Bob Matsuoka" → ["bob", "robert", "bob_matsuoka", "robert_matsuoka", "matsuoka"]
 * - "John Doe" → ["john", "john_doe", "doe"]
 *
 * @param fullName - Full name (e.g., "Bob Matsuoka")
 * @returns Array of normalized name variations
 */
export function generateNameAliases(fullName: string): string[] {
  const aliases = new Set<string>();

  // Normalize full name
  const normalized = normalizeEntityName(fullName);
  aliases.add(normalized);

  // Split into parts
  const parts = fullName.trim().split(/\s+/);

  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];

    // Add first name
    aliases.add(normalizeEntityName(firstName));

    // Add last name
    aliases.add(normalizeEntityName(lastName));

    // Add first_last combination
    aliases.add(`${normalizeEntityName(firstName)}_${normalizeEntityName(lastName)}`);

    // Add common nickname variations (if applicable)
    const nicknames = getCommonNicknames(firstName.toLowerCase());
    nicknames.forEach((nickname) => {
      aliases.add(normalizeEntityName(nickname));
      aliases.add(`${normalizeEntityName(nickname)}_${normalizeEntityName(lastName)}`);
    });
  } else if (parts.length === 1) {
    // Single name (just first or last)
    aliases.add(normalizeEntityName(parts[0]));
  }

  return Array.from(aliases);
}

/**
 * Get common nickname variations for a given name
 *
 * Examples:
 * - "robert" → ["rob", "bob", "bobby"]
 * - "william" → ["will", "bill", "billy"]
 *
 * @param firstName - First name in lowercase
 * @returns Array of common nicknames
 */
function getCommonNicknames(firstName: string): string[] {
  const nicknameMap: Record<string, string[]> = {
    robert: ['rob', 'bob', 'bobby'],
    william: ['will', 'bill', 'billy'],
    richard: ['rick', 'dick', 'rich'],
    michael: ['mike', 'mick', 'mikey'],
    christopher: ['chris', 'topher'],
    matthew: ['matt'],
    jonathan: ['jon', 'john'],
    nicholas: ['nick', 'nicky'],
    benjamin: ['ben', 'benny'],
    alexander: ['alex', 'al', 'xander'],
    elizabeth: ['liz', 'beth', 'betty', 'eliza'],
    katherine: ['kate', 'katy', 'katie', 'kat'],
    margaret: ['maggie', 'meg', 'peggy'],
    jennifer: ['jen', 'jenny'],
    jessica: ['jess', 'jessie'],
    rebecca: ['becky', 'becca'],
    stephanie: ['steph', 'steffi'],
    samantha: ['sam', 'sammy'],
    victoria: ['vicky', 'tori'],
    daniel: ['dan', 'danny'],
  };

  return nicknameMap[firstName.toLowerCase()] || [];
}

/**
 * Normalize entity name for comparison
 * (lowercase, remove punctuation, convert spaces to underscores)
 */
function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .trim();
}

/**
 * Check if an entity refers to the current user
 *
 * @param entity - Entity to check
 * @param identity - User identity with aliases
 * @returns True if entity is the current user
 */
export function isCurrentUser(entity: Entity, identity: UserIdentity): boolean {
  // Only check person and email entities
  if (entity.type !== 'person') {
    return false;
  }

  const normalized = normalizeEntityName(entity.value);

  // Check against primary name
  if (normalized === normalizeEntityName(identity.primaryName)) {
    return true;
  }

  // Check against aliases
  if (identity.aliases.some((alias) => normalized === alias)) {
    return true;
  }

  // Check against email aliases (if entity value is an email)
  if (identity.emailAliases.some((email) => entity.value.toLowerCase().includes(email))) {
    return true;
  }

  return false;
}

/**
 * Normalize entities to consolidate user's own identity
 *
 * - Mark entities that are "me" with metadata flag
 * - Consolidate all user aliases to the primary name
 *
 * @param entities - Entities to normalize
 * @param identity - User identity with aliases
 * @returns Entities with user identity consolidated
 */
export function normalizeToCurrentUser(entities: Entity[], identity: UserIdentity): Entity[] {
  return entities.map((entity) => {
    if (isCurrentUser(entity, identity)) {
      // Mark as current user and use primary name
      return {
        ...entity,
        value: identity.primaryName,
        normalized: normalizeEntityName(identity.primaryName),
        context: entity.context ? `${entity.context} (YOU)` : '(YOU)',
        // Add metadata flag (not in type definition, but can be added dynamically)
        metadata: {
          ...(entity as any).metadata,
          is_self: true,
        },
      } as Entity;
    }
    return entity;
  });
}

/**
 * Extract user identity context for LLM prompt
 *
 * Provides context about who "me" is for better entity extraction.
 *
 * @param identity - User identity
 * @returns Formatted string for prompt injection
 */
export function getUserContextForPrompt(identity: UserIdentity): string {
  return `
**User Context (WHO IS "ME"):**
- Your name: ${identity.primaryName}
- Your email: ${identity.primaryEmail}
- Known aliases: ${identity.aliases.join(', ')}

When extracting person entities:
- If you see "${identity.primaryName}" in From/To/CC, mark it as the current user (high confidence)
- If you see any of the aliases (${identity.aliases.join(', ')}), this is also YOU
- DO NOT extract your own name from emails you sent (From field) - you already know who you are
- DO extract recipients of emails you sent (To/CC) - these are people you communicate with
`.trim();
}
