/**
 * Entity Matcher - Phase 1 Entity Resolution
 *
 * Provides confidence scoring for entity matching using:
 * - Exact match detection (1.0 confidence)
 * - Alias matching from entity_aliases table (0.95 confidence)
 * - Jaro-Winkler string similarity for fuzzy matching
 * - First/last name component matching
 *
 * Part of the Human-in-the-Loop entity resolution system.
 */

import type { Entity, EntityType } from './types';
import { dbClient } from '@/lib/db';
import { entityAliases, mergeSuggestions, type EntityAlias, type NewMergeSuggestion } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const LOG_PREFIX = '[EntityMatcher]';

/**
 * Minimum similarity threshold for considering entities as potential matches
 */
export const MIN_MATCH_THRESHOLD = 0.7;

/**
 * Threshold for auto-accepting matches (very high confidence)
 */
export const AUTO_ACCEPT_THRESHOLD = 0.95;

/**
 * Threshold for flagging for human review (moderate confidence)
 */
export const REVIEW_THRESHOLD = 0.8;

/**
 * Result of comparing two entities
 */
export interface MatchResult {
  entity1: Entity;
  entity2: Entity;
  confidence: number;
  matchReason: string;
}

/**
 * Extended entity with identity flag and match confidence
 */
export interface ExtendedEntity extends Entity {
  isIdentity?: boolean;
  matchConfidence?: number;
}

/**
 * Jaro-Winkler string similarity algorithm
 *
 * Returns a value between 0.0 (no similarity) and 1.0 (identical strings).
 * Jaro-Winkler gives higher scores to strings that match from the beginning.
 *
 * @param s1 - First string to compare
 * @param s2 - Second string to compare
 * @returns Similarity score between 0.0 and 1.0
 */
export function jaroWinklerSimilarity(s1: string, s2: string): number {
  // Normalize strings: lowercase and trim
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();

  // Handle edge cases
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  // Calculate Jaro similarity first
  const jaroSim = jaroSimilarity(str1, str2);

  // Jaro-Winkler adds a prefix bonus
  // Common prefix length (max 4 characters)
  let prefixLength = 0;
  const maxPrefixLength = Math.min(4, Math.min(str1.length, str2.length));

  for (let i = 0; i < maxPrefixLength; i++) {
    if (str1[i] === str2[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  // Scaling factor (typically 0.1)
  const scalingFactor = 0.1;

  // Jaro-Winkler = Jaro + (prefix * scaling * (1 - Jaro))
  const jaroWinkler = jaroSim + prefixLength * scalingFactor * (1 - jaroSim);

  return Math.min(1.0, jaroWinkler); // Cap at 1.0
}

/**
 * Jaro similarity algorithm (base for Jaro-Winkler)
 *
 * @param s1 - First string
 * @param s2 - Second string
 * @returns Jaro similarity score
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;

  const len1 = s1.length;
  const len2 = s2.length;

  // Maximum distance for matching
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;

  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  // Jaro similarity formula
  const jaro =
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

  return jaro;
}

/**
 * Calculate match score between two entities
 *
 * Scoring logic:
 * - Exact match (same value after normalization): 1.0
 * - Known alias match: 0.95
 * - Jaro-Winkler >= 0.9: 0.9
 * - First name + last name match: 0.8
 * - Jaro-Winkler between 0.7-0.9: scaled score
 * - Below 0.7: no match
 *
 * @param entity1 - First entity to compare
 * @param entity2 - Second entity to compare
 * @param aliases - Known aliases for the user
 * @returns Match confidence score (0.0 to 1.0) and reason
 */
export function calculateMatchScore(
  entity1: Entity,
  entity2: Entity,
  aliases: EntityAlias[] = []
): { confidence: number; reason: string } {
  // Different types never match
  if (entity1.type !== entity2.type) {
    return { confidence: 0.0, reason: 'Different entity types' };
  }

  const value1 = normalizeForMatching(entity1.value);
  const value2 = normalizeForMatching(entity2.value);

  // 1. Exact match after normalization
  if (value1 === value2) {
    return { confidence: 1.0, reason: 'Exact match' };
  }

  // 2. Check known aliases
  const aliasMatch = checkAliasMatch(entity1, entity2, aliases);
  if (aliasMatch.isMatch) {
    return { confidence: 0.95, reason: aliasMatch.reason };
  }

  // 3. For person entities, check first/last name components
  if (entity1.type === 'person') {
    const nameMatch = checkNameComponentMatch(value1, value2);
    if (nameMatch.confidence > 0) {
      return nameMatch;
    }
  }

  // 4. Jaro-Winkler similarity
  const similarity = jaroWinklerSimilarity(value1, value2);

  if (similarity >= 0.9) {
    return { confidence: 0.9, reason: `High Jaro-Winkler similarity (${similarity.toFixed(3)})` };
  }

  if (similarity >= MIN_MATCH_THRESHOLD) {
    return {
      confidence: similarity,
      reason: `Jaro-Winkler similarity (${similarity.toFixed(3)})`,
    };
  }

  return { confidence: 0.0, reason: 'Below similarity threshold' };
}

/**
 * Check if two entities match via known aliases
 */
function checkAliasMatch(
  entity1: Entity,
  entity2: Entity,
  aliases: EntityAlias[]
): { isMatch: boolean; reason: string } {
  const type = entity1.type;
  const value1Lower = entity1.value.toLowerCase();
  const value2Lower = entity2.value.toLowerCase();

  // Find aliases for this entity type
  const typeAliases = aliases.filter((a) => a.entityType === type);

  for (const alias of typeAliases) {
    const canonicalLower = alias.entityValue.toLowerCase();
    const aliasLower = alias.alias.toLowerCase();

    // Check if one entity is canonical and other is alias
    if (
      (value1Lower === canonicalLower && value2Lower === aliasLower) ||
      (value1Lower === aliasLower && value2Lower === canonicalLower)
    ) {
      return {
        isMatch: true,
        reason: `Known alias: "${alias.alias}" -> "${alias.entityValue}"`,
      };
    }
  }

  return { isMatch: false, reason: '' };
}

/**
 * Check for name component matches (first name + last name)
 *
 * Examples:
 * - "Bob Smith" vs "Robert Smith" -> 0.8 (same last name, first name is nickname)
 * - "John Doe" vs "J. Doe" -> 0.7 (same last name, initial match)
 */
function checkNameComponentMatch(
  name1: string,
  name2: string
): { confidence: number; reason: string } {
  const parts1 = name1.split(/\s+/).filter((p) => p.length > 0);
  const parts2 = name2.split(/\s+/).filter((p) => p.length > 0);

  // Need at least 2 parts for component matching
  if (parts1.length < 2 || parts2.length < 2) {
    return { confidence: 0.0, reason: 'Not enough name parts' };
  }

  const firstName1 = parts1[0];
  const lastName1 = parts1[parts1.length - 1];
  const firstName2 = parts2[0];
  const lastName2 = parts2[parts2.length - 1];

  // Same last name check
  const lastNameSimilarity = jaroWinklerSimilarity(lastName1, lastName2);

  if (lastNameSimilarity >= 0.9) {
    // Last names match, check first names
    const firstNameSimilarity = jaroWinklerSimilarity(firstName1, firstName2);

    // Check for nickname patterns
    const nicknameMatch = checkNicknameMatch(firstName1, firstName2);

    if (nicknameMatch) {
      return {
        confidence: 0.85,
        reason: `Same last name, nickname match: ${firstName1} / ${firstName2}`,
      };
    }

    // Check for initial match (J. vs John)
    if (isInitialMatch(firstName1, firstName2)) {
      return {
        confidence: 0.7,
        reason: `Same last name, initial match: ${firstName1} / ${firstName2}`,
      };
    }

    // High first name similarity
    if (firstNameSimilarity >= 0.8) {
      return {
        confidence: 0.8,
        reason: `Same last name, similar first names (${firstNameSimilarity.toFixed(3)})`,
      };
    }
  }

  return { confidence: 0.0, reason: 'No component match' };
}

/**
 * Check if two first names are nickname variants
 */
function checkNicknameMatch(name1: string, name2: string): boolean {
  const nicknameMap: Record<string, string[]> = {
    robert: ['rob', 'bob', 'bobby', 'robbie'],
    william: ['will', 'bill', 'billy', 'willy'],
    richard: ['rick', 'dick', 'rich', 'richie'],
    michael: ['mike', 'mikey', 'mick'],
    christopher: ['chris', 'topher', 'kit'],
    matthew: ['matt', 'matty'],
    jonathan: ['jon', 'john', 'johnny'],
    nicholas: ['nick', 'nicky'],
    benjamin: ['ben', 'benny', 'benji'],
    alexander: ['alex', 'al', 'xander', 'sandy'],
    elizabeth: ['liz', 'beth', 'betty', 'eliza', 'lizzy'],
    katherine: ['kate', 'katy', 'katie', 'kat', 'kitty'],
    margaret: ['maggie', 'meg', 'peggy', 'marge'],
    jennifer: ['jen', 'jenny'],
    jessica: ['jess', 'jessie'],
    rebecca: ['becky', 'becca'],
    stephanie: ['steph', 'steffi'],
    samantha: ['sam', 'sammy'],
    victoria: ['vicky', 'tori', 'vic'],
    daniel: ['dan', 'danny'],
    david: ['dave', 'davy'],
    james: ['jim', 'jimmy', 'jamie'],
    joseph: ['joe', 'joey'],
    thomas: ['tom', 'tommy'],
    edward: ['ed', 'eddie', 'ted', 'teddy'],
    anthony: ['tony'],
    andrew: ['andy', 'drew'],
    charles: ['charlie', 'chuck'],
    peter: ['pete'],
    patrick: ['pat', 'paddy'],
    gregory: ['greg'],
    timothy: ['tim', 'timmy'],
    steven: ['steve'],
    stephen: ['steve'],
    lawrence: ['larry', 'laurie'],
    raymond: ['ray'],
    ronald: ['ron', 'ronnie'],
    donald: ['don', 'donny'],
  };

  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();

  // Check if one is a nickname of the other
  for (const [formal, nicknames] of Object.entries(nicknameMap)) {
    const allVariants = [formal, ...nicknames];
    if (allVariants.includes(n1) && allVariants.includes(n2)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if one name is an initial of the other
 * e.g., "J." matches "John", "A" matches "Alice"
 */
function isInitialMatch(name1: string, name2: string): boolean {
  const isInitial = (s: string) => s.length <= 2 && (s.length === 1 || s.endsWith('.'));

  if (isInitial(name1)) {
    return name2.toLowerCase().startsWith(name1.replace('.', '').toLowerCase());
  }
  if (isInitial(name2)) {
    return name1.toLowerCase().startsWith(name2.replace('.', '').toLowerCase());
  }

  return false;
}

/**
 * Normalize a value for matching
 * - Lowercase
 * - Remove punctuation
 * - Normalize whitespace
 */
function normalizeForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Find potential matches for a set of entities
 *
 * Compares all entities of the same type to find potential duplicates.
 * Returns matches above the minimum threshold for human review.
 *
 * @param entities - Entities to compare
 * @param userId - User ID for loading aliases
 * @returns Array of match results above threshold
 */
export async function findPotentialMatches(
  entities: Entity[],
  userId: string
): Promise<MatchResult[]> {
  const db = dbClient.getDb();

  // Load user's known aliases
  const aliases = await db
    .select()
    .from(entityAliases)
    .where(eq(entityAliases.userId, userId));

  console.log(`${LOG_PREFIX} Loaded ${aliases.length} aliases for user ${userId}`);

  const matches: MatchResult[] = [];

  // Group entities by type for efficiency
  const entitiesByType = new Map<EntityType, Entity[]>();
  for (const entity of entities) {
    const existing = entitiesByType.get(entity.type) || [];
    existing.push(entity);
    entitiesByType.set(entity.type, existing);
  }

  // Compare within each type group
  for (const [type, typeEntities] of entitiesByType) {
    console.log(`${LOG_PREFIX} Comparing ${typeEntities.length} ${type} entities`);

    // Compare each pair (avoid duplicate comparisons)
    for (let i = 0; i < typeEntities.length; i++) {
      for (let j = i + 1; j < typeEntities.length; j++) {
        const entity1 = typeEntities[i];
        const entity2 = typeEntities[j];

        const { confidence, reason } = calculateMatchScore(entity1, entity2, aliases);

        if (confidence >= MIN_MATCH_THRESHOLD) {
          matches.push({
            entity1,
            entity2,
            confidence,
            matchReason: reason,
          });
        }
      }
    }
  }

  // Sort by confidence (highest first)
  matches.sort((a, b) => b.confidence - a.confidence);

  console.log(`${LOG_PREFIX} Found ${matches.length} potential matches`);

  return matches;
}

/**
 * Create merge suggestions for review
 *
 * Takes match results and creates merge_suggestions records for human review.
 * High confidence matches (>=0.95) can be auto-accepted if configured.
 *
 * @param matches - Match results from findPotentialMatches
 * @param userId - User ID
 * @param autoAcceptHighConfidence - Whether to auto-accept matches >= AUTO_ACCEPT_THRESHOLD
 * @returns Number of suggestions created
 */
export async function createMergeSuggestions(
  matches: MatchResult[],
  userId: string,
  autoAcceptHighConfidence: boolean = false
): Promise<{ created: number; autoAccepted: number }> {
  const db = dbClient.getDb();

  let created = 0;
  let autoAccepted = 0;

  for (const match of matches) {
    // Determine status based on confidence
    let status: 'pending' | 'accepted' | 'rejected' = 'pending';
    if (autoAcceptHighConfidence && match.confidence >= AUTO_ACCEPT_THRESHOLD) {
      status = 'accepted';
      autoAccepted++;
    }

    const suggestion: NewMergeSuggestion = {
      userId,
      entity1Type: match.entity1.type,
      entity1Value: match.entity1.value,
      entity2Type: match.entity2.type,
      entity2Value: match.entity2.value,
      confidence: match.confidence,
      matchReason: match.matchReason,
      status,
      reviewedAt: status === 'accepted' ? new Date() : null,
    };

    try {
      await db.insert(mergeSuggestions).values(suggestion);
      created++;
    } catch (error) {
      // Might be a duplicate - skip
      console.log(`${LOG_PREFIX} Skipping duplicate suggestion: ${match.entity1.value} <-> ${match.entity2.value}`);
    }
  }

  console.log(`${LOG_PREFIX} Created ${created} merge suggestions (${autoAccepted} auto-accepted)`);

  return { created, autoAccepted };
}

/**
 * Extend entities with identity flag and match confidence
 *
 * Instead of filtering out identity entities, tag them with isIdentity=true.
 * This allows the UI to display them with a "You" badge.
 *
 * @param entities - Entities to extend
 * @param isIdentityEntity - Function to check if entity is the user's identity
 * @returns Extended entities with isIdentity and matchConfidence properties
 */
export function extendEntitiesWithIdentity(
  entities: Entity[],
  isIdentityEntity: (entity: Entity) => boolean
): ExtendedEntity[] {
  return entities.map((entity) => ({
    ...entity,
    isIdentity: isIdentityEntity(entity),
    matchConfidence: undefined, // Set during deduplication
  }));
}
