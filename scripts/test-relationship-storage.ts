/**
 * Test Weaviate Relationship Storage
 *
 * Verify the relationship storage layer works correctly.
 */

import {
  initializeSchema,
  saveRelationships,
  getAllRelationships,
  getEntityRelationships,
  buildRelationshipGraph,
  getRelationshipStats,
} from '../src/lib/weaviate';
import type { InferredRelationship } from '../src/lib/relationships/types';

const TEST_USER_ID = 'test-user-123';

async function main() {
  console.log('🧪 Testing Weaviate Relationship Storage\n');

  // 1. Initialize schema
  console.log('1️⃣  Initializing schema...');
  await initializeSchema();
  console.log('✅ Schema initialized\n');

  // 2. Create test relationships
  const testRelationships: InferredRelationship[] = [
    {
      fromEntityType: 'person',
      fromEntityValue: 'john doe',
      toEntityType: 'company',
      toEntityValue: 'acme corp',
      relationshipType: 'WORKS_FOR',
      confidence: 0.95,
      evidence: 'John Doe is the CTO at Acme Corp',
      sourceId: 'email-123',
      userId: TEST_USER_ID,
      inferredAt: new Date().toISOString(),
    },
    {
      fromEntityType: 'person',
      fromEntityValue: 'john doe',
      toEntityType: 'person',
      toEntityValue: 'jane smith',
      relationshipType: 'WORKS_WITH',
      confidence: 0.88,
      evidence: 'John and Jane collaborated on the Q4 roadmap',
      sourceId: 'email-124',
      userId: TEST_USER_ID,
      inferredAt: new Date().toISOString(),
    },
    {
      fromEntityType: 'person',
      fromEntityValue: 'jane smith',
      toEntityType: 'project',
      toEntityValue: 'project alpha',
      relationshipType: 'LEADS',
      confidence: 0.92,
      evidence: 'Jane is leading Project Alpha',
      sourceId: 'email-125',
      userId: TEST_USER_ID,
      inferredAt: new Date().toISOString(),
    },
  ];

  // 3. Save relationships
  console.log('2️⃣  Saving test relationships...');
  const savedCount = await saveRelationships(testRelationships, TEST_USER_ID);
  console.log(`✅ Saved ${savedCount} relationships\n`);

  // 4. Get all relationships
  console.log('3️⃣  Fetching all relationships...');
  const allRels = await getAllRelationships(TEST_USER_ID);
  console.log(`✅ Found ${allRels.length} total relationships:`);
  allRels.forEach((rel) => {
    console.log(
      `   ${rel.fromEntityValue} (${rel.fromEntityType}) → ${rel.relationshipType} → ${rel.toEntityValue} (${rel.toEntityType})`
    );
  });
  console.log();

  // 5. Get relationships for specific entity
  console.log('4️⃣  Fetching relationships for "john doe"...');
  const johnRels = await getEntityRelationships('person', 'john doe', TEST_USER_ID);
  console.log(`✅ Found ${johnRels.length} relationships for John Doe:`);
  johnRels.forEach((rel) => {
    console.log(
      `   ${rel.fromEntityValue} → ${rel.relationshipType} → ${rel.toEntityValue}`
    );
  });
  console.log();

  // 6. Build relationship graph
  console.log('5️⃣  Building relationship graph...');
  const graph = await buildRelationshipGraph(TEST_USER_ID, {
    minConfidence: 0.5,
  });
  console.log(`✅ Graph built successfully:`);
  console.log(`   Nodes: ${graph.stats.totalNodes}`);
  console.log(`   Edges: ${graph.stats.totalEdges}`);
  console.log(`   Avg Connections: ${graph.stats.avgConnections}`);
  console.log();

  // 7. Get relationship statistics
  console.log('6️⃣  Getting relationship statistics...');
  const stats = await getRelationshipStats(TEST_USER_ID);
  console.log(`✅ Statistics:`);
  console.log(`   Total: ${stats.total}`);
  console.log(`   Avg Confidence: ${stats.avgConfidence}`);
  console.log(`   By Type:`);
  Object.entries(stats.byType).forEach(([type, count]) => {
    console.log(`     ${type}: ${count}`);
  });
  console.log();

  console.log('🎉 All tests passed!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
