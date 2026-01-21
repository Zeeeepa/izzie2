/**
 * Debug script to simulate /api/relationships/graph endpoint
 *
 * Usage: pnpm check:user-graph
 *
 * This script calls buildRelationshipGraph with a specific userId
 * and prints detailed information about the returned data.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env.local for local development
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '.env.local');
dotenv.config({ path: envPath });

import { buildRelationshipGraph } from '../src/lib/weaviate/relationships';

const TARGET_USER_ID = 'W1SkmfubAgAw1WzkmebBPJDouzuFoaCV';
const MIN_CONFIDENCE = 0.5;

async function main() {
  console.log('='.repeat(80));
  console.log('Simulating /api/relationships/graph endpoint');
  console.log('='.repeat(80));
  console.log(`\nUserId: ${TARGET_USER_ID}`);
  console.log(`MinConfidence: ${MIN_CONFIDENCE}`);
  console.log('');

  try {
    const graph = await buildRelationshipGraph(TARGET_USER_ID, {
      minConfidence: MIN_CONFIDENCE,
    });

    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total nodes: ${graph.nodes.length}`);
    console.log(`Total edges: ${graph.edges.length}`);

    // Check for problematic nodes
    console.log('\n' + '='.repeat(80));
    console.log('CHECKING FOR PROBLEMATIC NODES');
    console.log('='.repeat(80));

    const problematicNodes = graph.nodes.filter((node) => {
      const value = node.value;
      return (
        value === undefined ||
        value === null ||
        value === '' ||
        value === 'undefined' ||
        value === 'null' ||
        (typeof value === 'string' && value.trim() === '')
      );
    });

    if (problematicNodes.length > 0) {
      console.log(`\nFOUND ${problematicNodes.length} PROBLEMATIC NODES:`);
      problematicNodes.forEach((node, i) => {
        console.log(`\n[Problematic Node ${i + 1}]`);
        console.log(JSON.stringify(node, null, 2));
      });
    } else {
      console.log('\nNo problematic nodes found (all nodes have valid values)');
    }

    // Print first 10 nodes with all properties
    console.log('\n' + '='.repeat(80));
    console.log('FIRST 10 NODES (ALL PROPERTIES)');
    console.log('='.repeat(80));

    const nodesToShow = graph.nodes.slice(0, 10);
    nodesToShow.forEach((node, i) => {
      console.log(`\n[Node ${i + 1}]`);
      console.log(`  id: "${node.id}"`);
      console.log(`  type: "${node.type}"`);
      console.log(`  value: "${node.value}" (type: ${typeof node.value})`);
      console.log(`  normalized: "${node.normalized}" (type: ${typeof node.normalized})`);
      console.log(`  connectionCount: ${node.connectionCount}`);
      console.log('  Full object:', JSON.stringify(node, null, 4));
    });

    // Print first 10 edges with all properties
    console.log('\n' + '='.repeat(80));
    console.log('FIRST 10 EDGES (ALL PROPERTIES)');
    console.log('='.repeat(80));

    const edgesToShow = graph.edges.slice(0, 10);
    edgesToShow.forEach((edge, i) => {
      console.log(`\n[Edge ${i + 1}]`);
      console.log(`  id: "${edge.id}"`);
      console.log(`  source: "${edge.source}"`);
      console.log(`  target: "${edge.target}"`);
      console.log(`  type: "${edge.type}"`);
      console.log(`  confidence: ${edge.confidence}`);
      console.log(`  evidence: "${edge.evidence || '(none)'}"`);
      console.log('  Full object:', JSON.stringify(edge, null, 4));
    });

    // Stats breakdown by node type
    console.log('\n' + '='.repeat(80));
    console.log('NODE TYPE BREAKDOWN');
    console.log('='.repeat(80));

    const nodesByType: Record<string, number> = {};
    for (const node of graph.nodes) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }
    console.log(JSON.stringify(nodesByType, null, 2));

    // Stats breakdown by edge type
    console.log('\n' + '='.repeat(80));
    console.log('EDGE TYPE BREAKDOWN');
    console.log('='.repeat(80));

    const edgesByType: Record<string, number> = {};
    for (const edge of graph.edges) {
      edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
    }
    console.log(JSON.stringify(edgesByType, null, 2));

    // Print the exact JSON that would be returned by the API
    console.log('\n' + '='.repeat(80));
    console.log('EXACT API RESPONSE STRUCTURE (truncated)');
    console.log('='.repeat(80));

    const apiResponse = {
      nodes: graph.nodes.slice(0, 3),
      edges: graph.edges.slice(0, 3),
      stats: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      },
    };
    console.log(JSON.stringify(apiResponse, null, 2));

    console.log('\n' + '='.repeat(80));
    console.log('DONE');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
