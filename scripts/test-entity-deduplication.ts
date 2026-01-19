/**
 * Test Entity Deduplication Logic
 * Verifies the deduplication algorithm works as expected
 */

interface EntityData {
  id: string;
  type: string;
  value: string;
  normalized: string;
  confidence: number;
  source: string;
  sourceId: string;
  createdAt: string;
  occurrences?: number;
}

// Mock data with duplicates
const mockEntities: EntityData[] = [
  {
    id: 'person-robert_matsuoka-1',
    type: 'person',
    value: 'Robert (Masa) Matsuoka',
    normalized: 'robert_matsuoka',
    confidence: 0.95,
    source: 'gmail',
    sourceId: 'email-1',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'person-robert_matsuoka-2',
    type: 'person',
    value: 'Robert Matsuoka',
    normalized: 'robert_matsuoka',
    confidence: 0.92,
    source: 'gmail',
    sourceId: 'email-2',
    createdAt: '2024-01-14T10:00:00Z',
  },
  {
    id: 'person-robert_matsuoka-3',
    type: 'person',
    value: 'Robert (Masa) Matsuoka',
    normalized: 'robert_matsuoka',
    confidence: 0.95,
    source: 'gmail',
    sourceId: 'email-3',
    createdAt: '2024-01-16T10:00:00Z', // Most recent
  },
  {
    id: 'person-robert_matsuoka-4',
    type: 'person',
    value: 'Robert M.',
    normalized: 'robert_matsuoka',
    confidence: 0.85,
    source: 'gmail',
    sourceId: 'email-4',
    createdAt: '2024-01-13T10:00:00Z',
  },
  {
    id: 'company-acme-1',
    type: 'company',
    value: 'Acme Corp',
    normalized: 'acme_corp',
    confidence: 0.98,
    source: 'gmail',
    sourceId: 'email-5',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'company-acme-2',
    type: 'company',
    value: 'Acme Corporation',
    normalized: 'acme_corp',
    confidence: 0.98,
    source: 'gmail',
    sourceId: 'email-6',
    createdAt: '2024-01-14T10:00:00Z',
  },
];

// Deduplication algorithm (same as API route)
function deduplicateEntities(entities: EntityData[]): EntityData[] {
  console.log(`Deduplicating ${entities.length} entities...`);
  const entityMap = new Map<string, EntityData>();

  for (const entity of entities) {
    const key = `${entity.type}:${entity.normalized.toLowerCase()}`;
    const existing = entityMap.get(key);

    if (!existing) {
      // First occurrence - add with count of 1
      entityMap.set(key, { ...entity, occurrences: 1 });
    } else {
      // Update occurrences count
      existing.occurrences = (existing.occurrences || 1) + 1;

      // Determine if we should replace the existing entity
      // Priority: higher confidence > longer value (more details) > more recent
      const shouldReplace =
        entity.confidence > existing.confidence ||
        (entity.confidence === existing.confidence &&
          entity.value.length > existing.value.length) ||
        (entity.confidence === existing.confidence &&
          entity.value.length === existing.value.length &&
          new Date(entity.createdAt).getTime() > new Date(existing.createdAt).getTime());

      if (shouldReplace) {
        // Keep the better entity but preserve occurrences count
        entityMap.set(key, { ...entity, occurrences: existing.occurrences });
      }
    }
  }

  return Array.from(entityMap.values());
}

// Run test
console.log('\n=== Entity Deduplication Test ===\n');
console.log('Input entities:', mockEntities.length);
console.log('\nBefore deduplication:');
mockEntities.forEach((e) => {
  console.log(
    `  - ${e.type}:${e.normalized} = "${e.value}" (confidence: ${e.confidence}, created: ${e.createdAt})`
  );
});

const deduplicated = deduplicateEntities(mockEntities);

console.log('\n\nAfter deduplication:');
console.log('Unique entities:', deduplicated.length);
deduplicated.forEach((e) => {
  console.log(
    `  - ${e.type}:${e.normalized} = "${e.value}" (confidence: ${e.confidence}, occurrences: ${e.occurrences})`
  );
});

// Verify results
console.log('\n\n=== Verification ===');

const robertEntity = deduplicated.find((e) => e.normalized === 'robert_matsuoka');
if (robertEntity) {
  console.log('✅ Robert entity found');
  console.log(`   Value: "${robertEntity.value}"`);
  console.log(`   Expected: "Robert (Masa) Matsuoka" (most recent with highest confidence)`);
  console.log(`   Occurrences: ${robertEntity.occurrences} (expected: 4)`);

  if (
    robertEntity.value === 'Robert (Masa) Matsuoka' &&
    robertEntity.occurrences === 4 &&
    robertEntity.createdAt === '2024-01-16T10:00:00Z'
  ) {
    console.log('✅ Deduplication logic CORRECT for Robert');
  } else {
    console.log('❌ Deduplication logic INCORRECT for Robert');
  }
} else {
  console.log('❌ Robert entity not found!');
}

const acmeEntity = deduplicated.find((e) => e.normalized === 'acme_corp');
if (acmeEntity) {
  console.log('\n✅ Acme entity found');
  console.log(`   Value: "${acmeEntity.value}"`);
  console.log(`   Expected: "Acme Corporation" (longer value, same confidence)`);
  console.log(`   Occurrences: ${acmeEntity.occurrences} (expected: 2)`);

  if (
    acmeEntity.value === 'Acme Corporation' &&
    acmeEntity.occurrences === 2
  ) {
    console.log('✅ Deduplication logic CORRECT for Acme');
  } else {
    console.log('❌ Deduplication logic INCORRECT for Acme');
  }
} else {
  console.log('❌ Acme entity not found!');
}

console.log('\n=== Test Complete ===\n');
