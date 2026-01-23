/**
 * Entity Deduplication Service
 *
 * Cross-entity deduplication for finding and merging duplicate entities
 * stored in Weaviate. Uses string similarity algorithms and contextual
 * factors like email domain, company association, and co-occurrence patterns.
 */

import type { Entity, EntityType } from '../extraction/types';
import { listEntitiesByType } from '../weaviate/entities';
import { getWeaviateClient } from '../weaviate/client';
import { COLLECTIONS } from '../weaviate/schema';

const LOG_PREFIX = '[Entity Deduplication]';

/**
 * Match between two potentially duplicate entities
 */
export interface EntityMatch {
  entity1Id: string;
  entity2Id: string;
  entity1Value: string;
  entity2Value: string;
  entityType: EntityType;
  confidence: number; // 0-1 confidence they are duplicates
  matchFactors: MatchFactor[];
}

/**
 * Factors that contributed to a match
 */
export type MatchFactor =
  | 'same_email'
  | 'similar_name'
  | 'same_company'
  | 'same_domain'
  | 'nickname_match'
  | 'abbreviation_match'
  | 'co_occurrence';

/**
 * Entity with metadata for deduplication
 */
interface EntityWithMeta {
  id: string;
  type: EntityType;
  value: string;
  normalized: string;
  confidence: number;
  sourceId: string;
  context?: string;
  extractedAt?: string;
}

// Common nickname to full name mappings
const NICKNAME_MAP: Record<string, string[]> = {
  robert: ['bob', 'bobby', 'rob'],
  william: ['bill', 'billy', 'will', 'liam'],
  richard: ['rick', 'dick', 'rich'],
  michael: ['mike', 'mikey', 'mick'],
  christopher: ['chris', 'topher'],
  matthew: ['matt', 'matty'],
  jonathan: ['jon', 'jonny', 'john'],
  nicholas: ['nick', 'nicky'],
  benjamin: ['ben', 'benji'],
  alexander: ['alex', 'al', 'xander'],
  elizabeth: ['liz', 'lizzie', 'beth', 'betty'],
  katherine: ['kate', 'katy', 'katie', 'kat'],
  margaret: ['maggie', 'meg', 'peggy'],
  jennifer: ['jen', 'jenny'],
  jessica: ['jess', 'jessie'],
  rebecca: ['becky', 'becca'],
  stephanie: ['steph', 'stephie'],
  samantha: ['sam', 'sammy'],
  daniel: ['dan', 'danny'],
  david: ['dave', 'davey'],
  james: ['jim', 'jimmy', 'jamie'],
  joseph: ['joe', 'joey'],
  thomas: ['tom', 'tommy'],
  anthony: ['tony', 'ant'],
  edward: ['ed', 'eddie', 'ted', 'teddy'],
  charles: ['charlie', 'chuck'],
  raymond: ['ray'],
  gregory: ['greg'],
  stephen: ['steve', 'stevie'],
  timothy: ['tim', 'timmy'],
  patrick: ['pat', 'paddy'],
  joshua: ['josh'],
  andrew: ['andy', 'drew'],
  nathan: ['nate'],
  jacob: ['jake'],
  zachary: ['zach', 'zack'],
};

// Reverse map: nickname -> full names
const REVERSE_NICKNAME_MAP: Record<string, string[]> = {};
for (const [full, nicks] of Object.entries(NICKNAME_MAP)) {
  for (const nick of nicks) {
    if (!REVERSE_NICKNAME_MAP[nick]) {
      REVERSE_NICKNAME_MAP[nick] = [];
    }
    REVERSE_NICKNAME_MAP[nick].push(full);
  }
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;

  // Create distance matrix
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill in the rest
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate Jaro similarity between two strings
 * Returns a value between 0 (no similarity) and 1 (identical)
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchDistance = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);

  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
}

/**
 * Calculate Jaro-Winkler similarity (gives bonus for common prefix)
 * Returns a value between 0 and 1
 */
function jaroWinklerSimilarity(s1: string, s2: string, prefixScale: number = 0.1): number {
  const jaroSim = jaroSimilarity(s1, s2);

  // Find common prefix (up to 4 characters)
  let prefixLength = 0;
  const maxPrefixLength = Math.min(4, Math.min(s1.length, s2.length));

  for (let i = 0; i < maxPrefixLength; i++) {
    if (s1[i] === s2[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  return jaroSim + prefixLength * prefixScale * (1 - jaroSim);
}

/**
 * Extract email from a string (e.g., "John Doe <john@example.com>")
 */
function extractEmail(value: string): string | null {
  const emailMatch = value.match(/[\w.-]+@[\w.-]+\.\w+/);
  return emailMatch ? emailMatch[0].toLowerCase() : null;
}

/**
 * Extract domain from email
 */
function extractDomain(email: string): string {
  const parts = email.split('@');
  return parts.length > 1 ? parts[1].toLowerCase() : '';
}

/**
 * Normalize name for comparison
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

/**
 * Get first name from full name
 */
function getFirstName(fullName: string): string {
  const parts = normalizeName(fullName).split(' ');
  return parts[0] || '';
}

/**
 * Check if two names could be nickname variants
 */
function areNicknameVariants(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1).split(' ')[0] || '';
  const n2 = normalizeName(name2).split(' ')[0] || '';

  if (n1 === n2) return true;

  // Check if n1 is a nickname of n2
  const n1FullNames = REVERSE_NICKNAME_MAP[n1] || [];
  if (n1FullNames.includes(n2)) return true;

  // Check if n2 is a nickname of n1
  const n2FullNames = REVERSE_NICKNAME_MAP[n2] || [];
  if (n2FullNames.includes(n1)) return true;

  // Check if n1 is the full name and n2 is a nickname
  const n1Nicknames = NICKNAME_MAP[n1] || [];
  if (n1Nicknames.includes(n2)) return true;

  // Check if n2 is the full name and n1 is a nickname
  const n2Nicknames = NICKNAME_MAP[n2] || [];
  if (n2Nicknames.includes(n1)) return true;

  return false;
}

/**
 * Check if two company names might be abbreviation variants
 * e.g., "IBM" and "International Business Machines"
 */
function areAbbreviationVariants(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  // Check if one is an acronym of the other
  const words1 = n1.split(' ').filter((w) => w.length > 0);
  const words2 = n2.split(' ').filter((w) => w.length > 0);

  // Build acronym from longer name
  if (words1.length > words2.length && words2.length === 1) {
    const acronym = words1.map((w) => w[0]).join('');
    if (acronym === words2[0]) return true;
  }

  if (words2.length > words1.length && words1.length === 1) {
    const acronym = words2.map((w) => w[0]).join('');
    if (acronym === words1[0]) return true;
  }

  return false;
}

/**
 * Calculate match score between two entities
 */
export function calculateMatchScore(
  entity1: EntityWithMeta,
  entity2: EntityWithMeta
): EntityMatch | null {
  // Must be same type
  if (entity1.type !== entity2.type) return null;

  // Don't match entity with itself
  if (entity1.id === entity2.id) return null;

  const matchFactors: MatchFactor[] = [];
  let score = 0;

  const v1 = entity1.value;
  const v2 = entity2.value;
  const n1 = normalizeName(v1);
  const n2 = normalizeName(v2);

  // Check for exact normalized match (already a duplicate)
  if (n1 === n2) return null;

  // Type-specific matching logic
  if (entity1.type === 'person') {
    // Check for same email
    const email1 = extractEmail(v1) || extractEmail(entity1.context || '');
    const email2 = extractEmail(v2) || extractEmail(entity2.context || '');

    if (email1 && email2 && email1 === email2) {
      matchFactors.push('same_email');
      score += 0.9;
    } else if (email1 && email2) {
      // Same domain might indicate same company
      const domain1 = extractDomain(email1);
      const domain2 = extractDomain(email2);
      if (domain1 && domain2 && domain1 === domain2 && !domain1.includes('gmail') && !domain1.includes('yahoo') && !domain1.includes('hotmail')) {
        matchFactors.push('same_domain');
        score += 0.2;
      }
    }

    // Check nickname match
    if (areNicknameVariants(v1, v2)) {
      matchFactors.push('nickname_match');
      score += 0.4;
    }

    // Check name similarity (Jaro-Winkler)
    const nameSimilarity = jaroWinklerSimilarity(n1, n2);
    if (nameSimilarity > 0.85) {
      matchFactors.push('similar_name');
      score += nameSimilarity * 0.5;
    }

    // Check if last names match (strong indicator)
    const parts1 = n1.split(' ');
    const parts2 = n2.split(' ');
    if (parts1.length > 1 && parts2.length > 1) {
      const lastName1 = parts1[parts1.length - 1];
      const lastName2 = parts2[parts2.length - 1];
      if (lastName1 === lastName2 && lastName1.length > 2) {
        score += 0.3;
      }
    }
  } else if (entity1.type === 'company') {
    // Check abbreviation match
    if (areAbbreviationVariants(v1, v2)) {
      matchFactors.push('abbreviation_match');
      score += 0.7;
    }

    // Check name similarity
    const nameSimilarity = jaroWinklerSimilarity(n1, n2);
    if (nameSimilarity > 0.8) {
      matchFactors.push('similar_name');
      score += nameSimilarity * 0.6;
    }
  } else {
    // Generic entity matching using string similarity
    const similarity = jaroWinklerSimilarity(n1, n2);
    if (similarity > 0.85) {
      matchFactors.push('similar_name');
      score += similarity * 0.5;
    }
  }

  // Normalize score to 0-1
  score = Math.min(1, score);

  // Only return if confidence is above threshold
  if (score < 0.5 || matchFactors.length === 0) return null;

  return {
    entity1Id: entity1.id,
    entity2Id: entity2.id,
    entity1Value: entity1.value,
    entity2Value: entity2.value,
    entityType: entity1.type,
    confidence: score,
    matchFactors,
  };
}

/**
 * Find potential duplicate entities for a user
 */
export async function findPotentialDuplicates(
  userId: string,
  entityType?: EntityType
): Promise<EntityMatch[]> {
  console.log(`${LOG_PREFIX} Finding potential duplicates for user ${userId}...`);

  const typesToCheck: EntityType[] = entityType
    ? [entityType]
    : ['person', 'company', 'project', 'topic', 'location'];

  const matches: EntityMatch[] = [];

  for (const type of typesToCheck) {
    try {
      const entities = await listEntitiesByType(userId, type, 1000);

      // Convert to EntityWithMeta
      const entitiesWithMeta: EntityWithMeta[] = entities.map((e, idx) => ({
        id: `${type}-${idx}-${e.normalized || e.value}`,
        type,
        value: e.value,
        normalized: e.normalized,
        confidence: e.confidence,
        sourceId: e.sourceId || '',
        context: e.context,
        extractedAt: e.extractedAt,
      }));

      console.log(`${LOG_PREFIX} Checking ${entitiesWithMeta.length} ${type} entities for duplicates...`);

      // Compare all pairs (O(n^2) but necessary for deduplication)
      for (let i = 0; i < entitiesWithMeta.length; i++) {
        for (let j = i + 1; j < entitiesWithMeta.length; j++) {
          const match = calculateMatchScore(entitiesWithMeta[i], entitiesWithMeta[j]);
          if (match) {
            matches.push(match);
          }
        }
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error checking ${type} entities:`, error);
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);

  console.log(`${LOG_PREFIX} Found ${matches.length} potential duplicates`);
  return matches;
}

/**
 * Get AI-suggested merges above a confidence threshold
 */
export async function getSuggestedMerges(
  userId: string,
  minConfidence: number = 0.7
): Promise<EntityMatch[]> {
  const allMatches = await findPotentialDuplicates(userId);
  return allMatches.filter((m) => m.confidence >= minConfidence);
}

/**
 * Merge two entities - keeps the first entity and deletes the second
 *
 * Note: This is a destructive operation. The mergeEntityId will be deleted.
 * All references to mergeEntityId should be updated to keepEntityId.
 */
export async function mergeEntities(
  userId: string,
  keepEntityId: string,
  mergeEntityId: string
): Promise<{ success: boolean; message: string }> {
  console.log(`${LOG_PREFIX} Merging entity ${mergeEntityId} into ${keepEntityId}...`);

  // Parse entity IDs to get type and value
  // ID format: "type-index-normalizedValue"
  const parseEntityId = (id: string) => {
    const parts = id.split('-');
    if (parts.length < 3) return null;
    return {
      type: parts[0] as EntityType,
      value: parts.slice(2).join('-'),
    };
  };

  const keepParsed = parseEntityId(keepEntityId);
  const mergeParsed = parseEntityId(mergeEntityId);

  if (!keepParsed || !mergeParsed) {
    return { success: false, message: 'Invalid entity IDs' };
  }

  if (keepParsed.type !== mergeParsed.type) {
    return { success: false, message: 'Cannot merge entities of different types' };
  }

  try {
    const client = await getWeaviateClient();
    const collectionName = COLLECTIONS[keepParsed.type];

    if (!collectionName) {
      return { success: false, message: `Unknown entity type: ${keepParsed.type}` };
    }

    const collection = client.collections.get(collectionName);

    // Find and delete entities matching mergeEntityId value
    const result = await collection.query.fetchObjects({
      limit: 1000,
      returnProperties: ['value', 'normalized', 'userId'],
    });

    const normalizedMergeValue = mergeParsed.value.toLowerCase().replace(/\s+/g, '_');
    const objectsToDelete = result.objects.filter(
      (obj: any) =>
        (obj.properties.normalized?.toLowerCase().replace(/\s+/g, '_') === normalizedMergeValue ||
          obj.properties.value?.toLowerCase().replace(/\s+/g, '_') === normalizedMergeValue) &&
        obj.properties.userId === userId
    );

    if (objectsToDelete.length === 0) {
      return { success: false, message: 'Entity to merge not found' };
    }

    // Delete the merged entities
    for (const obj of objectsToDelete) {
      await collection.data.deleteById(obj.uuid);
    }

    console.log(`${LOG_PREFIX} Deleted ${objectsToDelete.length} merged entities`);

    return {
      success: true,
      message: `Merged ${objectsToDelete.length} entities into ${keepEntityId}`,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error merging entities:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Export utility functions for testing
export { levenshteinDistance, jaroSimilarity, jaroWinklerSimilarity };
