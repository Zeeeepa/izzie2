/**
 * Knowledge Graph Data API
 * GET /api/graph/data - Get graph data for visualization with enhanced filtering
 *
 * Query params:
 *  - entityTypes: Comma-separated list of entity types to include
 *  - relationshipTypes: Comma-separated list of relationship types to include
 *  - minConfidence: Minimum confidence threshold (0-1, default: 0.5)
 *  - limit: Max number of nodes to return (default: 100, max: 500)
 *  - centerEntity: Entity ID to center the graph around (optional)
 *  - depth: How many hops from center entity (1-3, default: 2)
 *  - includeStats: Include graph statistics (default: true)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getAllRelationships } from '@/lib/weaviate/relationships';
import type { EntityType } from '@/lib/extraction/types';
import type { RelationshipType } from '@/lib/relationships/types';

const LOG_PREFIX = '[Graph Data API]';

// Valid entity types
const VALID_ENTITY_TYPES: EntityType[] = [
  'person',
  'company',
  'project',
  'topic',
  'location',
  'action_item',
];

// Valid relationship types
const VALID_RELATIONSHIP_TYPES: RelationshipType[] = [
  'WORKS_WITH',
  'REPORTS_TO',
  'WORKS_FOR',
  'LEADS',
  'WORKS_ON',
  'EXPERT_IN',
  'LOCATED_IN',
  'PARTNERS_WITH',
  'COMPETES_WITH',
  'OWNS',
  'RELATED_TO',
  'DEPENDS_ON',
  'PART_OF',
  'SUBTOPIC_OF',
  'ASSOCIATED_WITH',
  'FAMILY_OF',
  'MARRIED_TO',
  'SIBLING_OF',
  'SAME_AS',
];

interface GraphNode {
  id: string;
  type: EntityType;
  value: string;
  normalized: string;
  connectionCount: number;
  isIdentity?: boolean; // Nodes involved in SAME_AS relationships
  cluster?: string; // Cluster ID for grouping related nodes
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  confidence: number;
  evidence?: string;
  isIdentity?: boolean; // SAME_AS relationships
}

interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  avgConfidence: number;
  identityRelationships: number;
  clusters: number;
}

interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats?: GraphStats;
  pagination: {
    total: number;
    returned: number;
    hasMore: boolean;
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const entityTypesParam = searchParams.get('entityTypes');
    const relationshipTypesParam = searchParams.get('relationshipTypes');
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0.5');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
    const centerEntityId = searchParams.get('centerEntity');
    const depth = Math.min(Math.max(parseInt(searchParams.get('depth') || '2', 10), 1), 3);
    const includeStats = searchParams.get('includeStats') !== 'false';

    // Parse entity type filters
    const entityTypeFilters: Set<EntityType> | null = entityTypesParam
      ? new Set(
          entityTypesParam
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter((t) => VALID_ENTITY_TYPES.includes(t as EntityType)) as EntityType[]
        )
      : null;

    // Parse relationship type filters
    const relationshipTypeFilters: Set<RelationshipType> | null = relationshipTypesParam
      ? new Set(
          relationshipTypesParam
            .split(',')
            .map((t) => t.trim().toUpperCase())
            .filter((t) => VALID_RELATIONSHIP_TYPES.includes(t as RelationshipType)) as RelationshipType[]
        )
      : null;

    console.log(`${LOG_PREFIX} Fetching graph data for user ${userId}`);
    console.log(`${LOG_PREFIX} Filters: entityTypes=${entityTypesParam}, relTypes=${relationshipTypesParam}, minConf=${minConfidence}, limit=${limit}`);

    // Fetch all relationships for user
    const relationships = await getAllRelationships(userId, 5000);

    // Filter relationships by confidence and type
    let filteredRels = relationships.filter((r) => r.confidence >= minConfidence);

    if (relationshipTypeFilters) {
      filteredRels = filteredRels.filter((r) => relationshipTypeFilters.has(r.relationshipType));
    }

    // Build nodes map
    const nodesMap = new Map<string, GraphNode>();
    const edgeCounts = new Map<string, number>();
    const identityNodes = new Set<string>(); // Track nodes involved in SAME_AS

    for (const rel of filteredRels) {
      // Track identity relationships
      if (rel.relationshipType === 'SAME_AS') {
        identityNodes.add(`${rel.fromEntityType}:${rel.fromEntityValue}`);
        identityNodes.add(`${rel.toEntityType}:${rel.toEntityValue}`);
      }

      // From node
      const fromId = `${rel.fromEntityType}:${rel.fromEntityValue}`;
      if (!nodesMap.has(fromId)) {
        nodesMap.set(fromId, {
          id: fromId,
          type: rel.fromEntityType,
          value: rel.fromEntityValue,
          normalized: rel.fromEntityValue.toLowerCase(),
          connectionCount: 0,
        });
      }
      edgeCounts.set(fromId, (edgeCounts.get(fromId) || 0) + 1);

      // To node
      const toId = `${rel.toEntityType}:${rel.toEntityValue}`;
      if (!nodesMap.has(toId)) {
        nodesMap.set(toId, {
          id: toId,
          type: rel.toEntityType,
          value: rel.toEntityValue,
          normalized: rel.toEntityValue.toLowerCase(),
          connectionCount: 0,
        });
      }
      edgeCounts.set(toId, (edgeCounts.get(toId) || 0) + 1);
    }

    // Update connection counts and identity flags
    for (const [id, count] of Array.from(edgeCounts.entries())) {
      const node = nodesMap.get(id);
      if (node) {
        node.connectionCount = count;
        node.isIdentity = identityNodes.has(id);
      }
    }

    // Apply entity type filter to nodes
    let filteredNodes = Array.from(nodesMap.values());
    if (entityTypeFilters) {
      filteredNodes = filteredNodes.filter((n) => entityTypeFilters.has(n.type));
    }

    // If center entity specified, filter to nodes within depth
    if (centerEntityId) {
      const reachableNodes = getNodesWithinDepth(centerEntityId, filteredRels, depth);
      filteredNodes = filteredNodes.filter((n) => reachableNodes.has(n.id));
    }

    // Sort by connection count (most connected first) and apply limit
    filteredNodes.sort((a, b) => b.connectionCount - a.connectionCount);
    const totalNodes = filteredNodes.length;
    const hasMore = filteredNodes.length > limit;
    filteredNodes = filteredNodes.slice(0, limit);

    // Get node IDs for edge filtering
    const nodeIds = new Set(filteredNodes.map((n) => n.id));

    // Build edges (only for visible nodes)
    const edgesMap = new Map<string, GraphEdge>();

    for (const rel of filteredRels) {
      const fromId = `${rel.fromEntityType}:${rel.fromEntityValue}`;
      const toId = `${rel.toEntityType}:${rel.toEntityValue}`;

      // Only include edges where both nodes are visible
      if (!nodeIds.has(fromId) || !nodeIds.has(toId)) {
        continue;
      }

      const edgeKey = `${fromId}:${rel.relationshipType}:${toId}`;

      const existing = edgesMap.get(edgeKey);
      if (existing) {
        // Keep higher confidence
        if (rel.confidence > existing.confidence) {
          existing.confidence = rel.confidence;
          existing.evidence = rel.evidence;
        }
      } else {
        edgesMap.set(edgeKey, {
          id: edgeKey,
          source: fromId,
          target: toId,
          type: rel.relationshipType,
          confidence: rel.confidence,
          evidence: rel.evidence,
          isIdentity: rel.relationshipType === 'SAME_AS',
        });
      }
    }

    const edges = Array.from(edgesMap.values());

    // Compute clusters using Union-Find for SAME_AS relationships
    const clusters = computeClusters(filteredNodes, edges);
    filteredNodes.forEach((node) => {
      node.cluster = clusters.get(node.id);
    });

    // Build response
    const response: GraphResponse = {
      nodes: filteredNodes,
      edges,
      pagination: {
        total: totalNodes,
        returned: filteredNodes.length,
        hasMore,
      },
    };

    // Add stats if requested
    if (includeStats) {
      const nodesByType: Record<string, number> = {};
      const edgesByType: Record<string, number> = {};
      let totalConfidence = 0;
      let identityCount = 0;
      const uniqueClusters = new Set<string>();

      for (const node of filteredNodes) {
        nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
        if (node.cluster) {
          uniqueClusters.add(node.cluster);
        }
      }

      for (const edge of edges) {
        edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
        totalConfidence += edge.confidence;
        if (edge.isIdentity) {
          identityCount++;
        }
      }

      response.stats = {
        totalNodes: filteredNodes.length,
        totalEdges: edges.length,
        nodesByType,
        edgesByType,
        avgConfidence: edges.length > 0 ? Math.round((totalConfidence / edges.length) * 100) / 100 : 0,
        identityRelationships: identityCount,
        clusters: uniqueClusters.size,
      };
    }

    console.log(`${LOG_PREFIX} Returning ${filteredNodes.length} nodes, ${edges.length} edges`);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return NextResponse.json(
      {
        error: 'Failed to fetch graph data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get all nodes within N hops of a center node
 */
function getNodesWithinDepth(
  centerNodeId: string,
  relationships: Array<{ fromEntityType: string; fromEntityValue: string; toEntityType: string; toEntityValue: string }>,
  maxDepth: number
): Set<string> {
  const reachable = new Set<string>();
  reachable.add(centerNodeId);

  let frontier = new Set<string>([centerNodeId]);

  for (let depth = 0; depth < maxDepth; depth++) {
    const newFrontier = new Set<string>();

    for (const rel of relationships) {
      const fromId = `${rel.fromEntityType}:${rel.fromEntityValue}`;
      const toId = `${rel.toEntityType}:${rel.toEntityValue}`;

      if (frontier.has(fromId) && !reachable.has(toId)) {
        newFrontier.add(toId);
        reachable.add(toId);
      }
      if (frontier.has(toId) && !reachable.has(fromId)) {
        newFrontier.add(fromId);
        reachable.add(fromId);
      }
    }

    frontier = newFrontier;
  }

  return reachable;
}

/**
 * Compute clusters using Union-Find algorithm
 * Groups nodes connected by SAME_AS relationships
 */
function computeClusters(nodes: GraphNode[], edges: GraphEdge[]): Map<string, string> {
  const parent = new Map<string, string>();

  // Initialize each node as its own parent
  for (const node of nodes) {
    parent.set(node.id, node.id);
  }

  // Find with path compression
  function find(x: string): string {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }

  // Union operation
  function union(x: string, y: string) {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX !== rootY) {
      parent.set(rootX, rootY);
    }
  }

  // Process SAME_AS edges to union nodes
  for (const edge of edges) {
    if (edge.isIdentity) {
      union(edge.source, edge.target);
    }
  }

  // Build cluster map
  const clusters = new Map<string, string>();
  for (const node of nodes) {
    clusters.set(node.id, find(node.id));
  }

  return clusters;
}
