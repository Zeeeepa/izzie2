/**
 * Relationship Graph Dashboard Page
 * Interactive visualization of entity relationships
 */

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BUILD_INFO } from '@/lib/build-info';

// Dynamically import ForceGraph2D to avoid SSR issues (A-Frame not defined error)
// Use react-force-graph-2d directly instead of react-force-graph to avoid A-Frame dependency
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '500px' }}>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-block',
            width: '40px',
            height: '40px',
            border: '4px solid #f3f4f6',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <p style={{ marginTop: '1rem', color: '#6b7280' }}>Loading graph...</p>
      </div>
    </div>
  ),
});

interface GraphNode {
  id: string;
  type: string;
  value: string;
  normalized: string;
  connectionCount: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: number;
  evidence?: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { nodeCount: number; edgeCount: number };
}

interface StatsData {
  byType: Record<string, number>;
  total: number;
  avgConfidence: number;
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person: { bg: '#eff6ff', text: '#1e40af', border: '#3b82f6' },
  company: { bg: '#f0fdf4', text: '#15803d', border: '#22c55e' },
  project: { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
  action_item: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
  topic: { bg: '#f3e8ff', text: '#6b21a8', border: '#a855f7' },
  location: { bg: '#fce7f3', text: '#9f1239', border: '#ec4899' },
};

const TYPE_ICONS: Record<string, string> = {
  person: 'P',
  company: 'C',
  project: 'J',
  topic: 'T',
  location: 'L',
  action_item: '!',
};

// Helper function for smart label truncation based on entity type
const truncateLabel = (label: string, entityType: string): string => {
  switch (entityType) {
    case 'person': {
      // Person: "John Smith" → "John S."
      const parts = label.trim().split(/\s+/);
      if (parts.length >= 2 && label.length > 10) {
        const firstName = parts[0];
        const lastInitial = parts[parts.length - 1][0];
        return `${firstName} ${lastInitial}.`;
      }
      return label.length > 12 ? label.slice(0, 11) + '\u2026' : label;
    }
    case 'company': {
      // Company: "Acme Corporation" → "Acme"
      // Common suffixes to remove
      const suffixes = [' Inc', ' Inc.', ' LLC', ' Ltd', ' Ltd.', ' Corp', ' Corp.', ' Corporation', ' Company', ' Co', ' Co.'];
      let shortened = label;
      for (const suffix of suffixes) {
        if (shortened.toLowerCase().endsWith(suffix.toLowerCase())) {
          shortened = shortened.slice(0, -suffix.length).trim();
          break;
        }
      }
      return shortened.length > 12 ? shortened.slice(0, 11) + '\u2026' : shortened;
    }
    default:
      // Default: 12 chars max with ellipsis
      return label.length > 12 ? label.slice(0, 11) + '\u2026' : label;
  }
};

const RELATIONSHIP_TYPES = [
  'WORKS_WITH', 'REPORTS_TO', 'WORKS_FOR', 'LEADS', 'WORKS_ON', 'EXPERT_IN',
  'LOCATED_IN', 'PARTNERS_WITH', 'COMPETES_WITH', 'OWNS', 'RELATED_TO',
  'DEPENDS_ON', 'PART_OF', 'SUBTOPIC_OF', 'ASSOCIATED_WITH',
  'FAMILY_OF', 'MARRIED_TO', 'SIBLING_OF', 'SAME_AS'
];

// Relationship category colors for link visualization
const RELATIONSHIP_CATEGORIES: Record<string, { types: string[]; color: string; dashArray?: string; label: string }> = {
  professional: {
    types: ['WORKS_WITH', 'REPORTS_TO', 'WORKS_FOR', 'LEADS', 'WORKS_ON', 'EXPERT_IN'],
    color: '#3b82f6', // blue
    label: 'Professional',
  },
  business: {
    types: ['PARTNERS_WITH', 'COMPETES_WITH', 'OWNS'],
    color: '#22c55e', // green
    label: 'Business',
  },
  structural: {
    types: ['RELATED_TO', 'DEPENDS_ON', 'PART_OF', 'SUBTOPIC_OF', 'ASSOCIATED_WITH'],
    color: '#6b7280', // gray
    dashArray: '5,5', // dashed line
    label: 'Structural',
  },
  geographic: {
    types: ['LOCATED_IN'],
    color: '#a855f7', // purple
    dashArray: '2,3', // dotted line
    label: 'Geographic',
  },
  personal: {
    types: ['FAMILY_OF', 'MARRIED_TO', 'SIBLING_OF'],
    color: '#ec4899', // pink
    label: 'Personal',
  },
  identity: {
    types: ['SAME_AS'],
    color: '#f59e0b', // amber/orange for identity relationships
    dashArray: '3,6', // distinct dashed pattern
    label: 'Identity (Same As)',
  },
};

// Helper to get category info for a relationship type
const getRelationshipCategory = (relType: string): { color: string; dashArray?: string; category: string } => {
  for (const [category, config] of Object.entries(RELATIONSHIP_CATEGORIES)) {
    if (config.types.includes(relType)) {
      return { color: config.color, dashArray: config.dashArray, category };
    }
  }
  // Default fallback
  return { color: '#94a3b8', category: 'other' };
};

const ENTITY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'person', label: 'People' },
  { value: 'company', label: 'Companies' },
  { value: 'project', label: 'Projects' },
  { value: 'topic', label: 'Topics' },
  { value: 'location', label: 'Locations' },
];

// All entity types that can be toggled
const ALL_ENTITY_TYPES = ['person', 'company', 'project', 'action_item', 'topic', 'location'];

export default function RelationshipsPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [selectedEntityType, setSelectedEntityType] = useState('');
  const [selectedRelType, setSelectedRelType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearResult, setClearResult] = useState<{
    success: boolean;
    deletedCount?: number;
    error?: string;
  } | null>(null);
  const graphRef = useRef<any>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  // Entity type visibility toggles - all visible by default
  const [visibleEntityTypes, setVisibleEntityTypes] = useState<Set<string>>(new Set(ALL_ENTITY_TYPES));
  // Highlight SAME_AS relationships toggle
  const [highlightSameAs, setHighlightSameAs] = useState(true);

  // Custom node rendering with type letter inside and label below (always visible)
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const graphNode = node as GraphNode;
    const radius = Math.sqrt(Math.max(4, graphNode.connectionCount * 2)) * 4;
    const nodeColor = TYPE_COLORS[graphNode.type]?.border || '#9ca3af';
    const bgColor = TYPE_COLORS[graphNode.type]?.bg || '#f3f4f6';
    const typeIcon = TYPE_ICONS[graphNode.type] || '?';

    // Node coordinates
    const x = node.x || 0;
    const y = node.y || 0;

    // Draw filled circle with border
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.strokeStyle = nodeColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw type letter inside node (always visible)
    const fontSize = Math.max(radius * 0.8, 8);
    ctx.font = `bold ${fontSize}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = nodeColor;
    ctx.fillText(typeIcon, x, y);

    // Always show labels at all zoom levels with smart truncation
    const label = truncateLabel(graphNode.value, graphNode.type);
    // Scale font size based on zoom, but keep minimum readable size
    const labelFontSize = Math.max(8, Math.min(12, 10 / globalScale));
    ctx.font = `${labelFontSize}px Sans-Serif`;

    // Measure text for background
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = labelFontSize;
    const padding = 2;
    const labelY = y + radius + 8 / globalScale;

    // Draw white background for label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(
      x - textWidth / 2 - padding,
      labelY - textHeight / 2 - padding,
      textWidth + padding * 2,
      textHeight + padding * 2
    );

    // Draw label text
    ctx.fillStyle = '#374151';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, labelY);
  }, []);

  // Pointer area for click detection (matches visible node size)
  const paintNodePointerArea = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const graphNode = node as GraphNode;
    const radius = Math.sqrt(Math.max(4, graphNode.connectionCount * 2)) * 4;
    const x = node.x || 0;
    const y = node.y || 0;

    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, 2 * Math.PI); // Slightly larger for easier clicking
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  const fetchGraph = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedEntityType) params.set('entityType', selectedEntityType);
      params.set('limit', '100');
      params.set('_t', Date.now().toString());
      const response = await fetch(`/api/relationships/graph?` + params.toString(), { credentials: 'include' });
      if (response.ok) {
        setGraphData(await response.json());
      } else {
        const err = await response.json();
        setError(err.details || err.error || 'Failed to fetch graph');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch graph');
    } finally {
      setIsLoading(false);
    }
  }, [selectedEntityType]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/relationships/stats', { credentials: 'include' });
      if (response.ok) setStats(await response.json());
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  useEffect(() => { fetchGraph(); fetchStats(); }, [fetchGraph, fetchStats]);

  // Debug logging for graph data
  useEffect(() => {
    if (graphData) {
      console.log('[Relationships] Graph data loaded:', {
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length,
        sampleNode: graphData.nodes[0],
        sampleNodeValue: graphData.nodes[0]?.value,
      });
    }
  }, [graphData]);

  // Configure forces after graph mounts for better node spacing
  useEffect(() => {
    if (graphRef.current && graphData?.nodes.length) {
      const fg = graphRef.current;

      // Configure charge force (node repulsion)
      const chargeForce = fg.d3Force('charge');
      if (chargeForce) {
        chargeForce.strength(-300);
      }

      // Configure link force (edge length)
      const linkForce = fg.d3Force('link');
      if (linkForce) {
        linkForce.distance(80);
      }

      // Add collision force to prevent node overlap
      // Dynamic import d3-force for collision detection
      import('d3-force').then(({ forceCollide }) => {
        fg.d3Force('collision', forceCollide((node: any) => {
          const graphNode = node as GraphNode;
          const radius = Math.sqrt(Math.max(4, graphNode.connectionCount * 2)) * 4;
          return radius + 15; // radius + padding for labels
        }));

        // Reheat simulation to apply new forces
        fg.d3ReheatSimulation();
      });
    }
  }, [graphData]);

  const filteredData = useMemo(() => {
    if (!graphData) return null;
    let nodes = graphData.nodes;
    let edges = graphData.edges;

    // Filter by visible entity types
    if (visibleEntityTypes.size < ALL_ENTITY_TYPES.length) {
      nodes = nodes.filter(n => visibleEntityTypes.has(n.type));
      const ids = new Set(nodes.map(n => n.id));
      edges = edges.filter(e => ids.has(e.source as string) && ids.has(e.target as string));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      nodes = nodes.filter(n => n.value.toLowerCase().includes(q) || n.normalized.toLowerCase().includes(q));
      const ids = new Set(nodes.map(n => n.id));
      edges = edges.filter(e => ids.has(e.source as string) && ids.has(e.target as string));
    }
    if (selectedRelType) {
      edges = edges.filter(e => e.type === selectedRelType);
      const ids = new Set<string>();
      edges.forEach(e => { ids.add(e.source as string); ids.add(e.target as string); });
      nodes = nodes.filter(n => ids.has(n.id));
    }
    return { nodes, links: edges.map(e => ({ ...e, source: e.source, target: e.target })) };
  }, [graphData, searchQuery, selectedRelType, visibleEntityTypes]);

  const getNodeColor = (node: GraphNode) => TYPE_COLORS[node.type]?.border || '#9ca3af';
  const handleNodeClick = useCallback((node: any) => { setSelectedNode(node); setSelectedEdge(null); }, []);
  const handleLinkClick = useCallback((link: any) => { setSelectedEdge(link); setSelectedNode(null); }, []);
  const getNodeEdges = useCallback((nodeId: string) => graphData?.edges.filter(e => e.source === nodeId || e.target === nodeId) || [], [graphData]);

  // Toggle entity type visibility
  const toggleEntityType = useCallback((entityType: string) => {
    setVisibleEntityTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entityType)) {
        newSet.delete(entityType);
      } else {
        newSet.add(entityType);
      }
      return newSet;
    });
  }, []);

  // Show all entity types
  const showAllEntityTypes = useCallback(() => {
    setVisibleEntityTypes(new Set(ALL_ENTITY_TYPES));
  }, []);

  // Hide all entity types (clear view)
  const hideAllEntityTypes = useCallback(() => {
    setVisibleEntityTypes(new Set());
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom();
      graphRef.current.zoom(currentZoom * 1.3, 400);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom();
      graphRef.current.zoom(currentZoom / 1.3, 400);
    }
  }, []);

  const handleZoomReset = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 50);
    }
  }, []);

  const handleCenterGraph = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.centerAt(0, 0, 400);
      graphRef.current.zoom(1, 400);
    }
  }, []);

  // Get unique relationship types for a node (for enhanced tooltip)
  const getNodeRelationshipTypes = useCallback((nodeId: string) => {
    const edges = graphData?.edges.filter(e => e.source === nodeId || e.target === nodeId) || [];
    const types = new Set(edges.map(e => e.type));
    return Array.from(types);
  }, [graphData]);

  // Enhanced tooltip generator for nodes
  const generateNodeTooltip = useCallback((node: any) => {
    const graphNode = node as GraphNode;
    const relTypes = getNodeRelationshipTypes(graphNode.id);
    const relTypesDisplay = relTypes.length > 0 ? relTypes.join(', ') : 'None';

    return `${graphNode.value}\nType: ${graphNode.type.charAt(0).toUpperCase() + graphNode.type.slice(1)}\nConnections: ${graphNode.connectionCount}\nRelationships: ${relTypesDisplay}`;
  }, [getNodeRelationshipTypes]);

  // Custom link rendering with category-based colors and dash patterns
  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const graphEdge = link as GraphEdge;
    const { color, dashArray } = getRelationshipCategory(graphEdge.type);
    const isSameAs = graphEdge.type === 'SAME_AS';

    // Get source and target coordinates
    const source = link.source;
    const target = link.target;
    const sx = source.x || 0;
    const sy = source.y || 0;
    const tx = target.x || 0;
    const ty = target.y || 0;

    // Calculate link width based on confidence
    // SAME_AS relationships get thicker lines to stand out
    let lineWidth = Math.max(1, graphEdge.confidence * 3);
    if (isSameAs && highlightSameAs) {
      lineWidth = Math.max(2.5, graphEdge.confidence * 4);
    }

    // For SAME_AS relationships, draw a glow effect first
    if (isSameAs && highlightSameAs) {
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)'; // amber glow
      ctx.lineWidth = lineWidth + 4;
      ctx.setLineDash([]);
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    // Apply dash pattern if specified
    if (dashArray) {
      const dashParts = dashArray.split(',').map(Number);
      ctx.setLineDash(dashParts);
    } else {
      ctx.setLineDash([]);
    }

    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // Reset dash pattern
    ctx.setLineDash([]);

    // Draw arrowhead (bidirectional for SAME_AS relationships)
    const arrowLength = isSameAs ? 8 : 6;
    const angle = Math.atan2(ty - sy, tx - sx);

    // Calculate position for arrowhead (at the end of the link)
    const targetRadius = Math.sqrt(Math.max(4, (target.connectionCount || 1) * 2)) * 4;
    const arrowX = tx - Math.cos(angle) * (targetRadius + 2);
    const arrowY = ty - Math.sin(angle) * (targetRadius + 2);

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(
      arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
      arrowY - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
      arrowY - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    // Draw second arrowhead for SAME_AS (bidirectional)
    if (isSameAs && highlightSameAs) {
      const sourceRadius = Math.sqrt(Math.max(4, (source.connectionCount || 1) * 2)) * 4;
      const arrow2X = sx + Math.cos(angle) * (sourceRadius + 2);
      const arrow2Y = sy + Math.sin(angle) * (sourceRadius + 2);
      const reverseAngle = angle + Math.PI;

      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.moveTo(arrow2X, arrow2Y);
      ctx.lineTo(
        arrow2X - arrowLength * Math.cos(reverseAngle - Math.PI / 6),
        arrow2Y - arrowLength * Math.sin(reverseAngle - Math.PI / 6)
      );
      ctx.lineTo(
        arrow2X - arrowLength * Math.cos(reverseAngle + Math.PI / 6),
        arrow2Y - arrowLength * Math.sin(reverseAngle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
    }
  }, [highlightSameAs]);

  // Helper to get ID from source/target (handles both string IDs and mutated node objects)
  const getEdgeNodeId = (sourceOrTarget: any): string => {
    if (typeof sourceOrTarget === 'string') return sourceOrTarget;
    if (sourceOrTarget && typeof sourceOrTarget === 'object' && sourceOrTarget.id) return sourceOrTarget.id;
    return '';
  };

  // Helper to get node value by ID
  const getNodeValue = (nodeId: string): string => {
    const node = graphData?.nodes.find(n => n.id === nodeId);
    return node?.value || 'Unknown';
  };

  const clearAllRelationships = useCallback(async () => {
    setIsClearing(true);
    setClearResult(null);
    setShowClearConfirm(false);
    try {
      const response = await fetch('/api/relationships?all=true', {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setClearResult({
          success: true,
          deletedCount: data.deletedCount,
        });
        await Promise.all([fetchGraph(), fetchStats()]);
      } else {
        setClearResult({
          success: false,
          error: data.error || 'Failed to clear relationships',
        });
      }
    } catch (err) {
      setClearResult({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to clear relationships',
      });
    } finally {
      setIsClearing(false);
    }
  }, [fetchGraph, fetchStats]);

  return (
    <div>
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111' }}>Relationship Graph</h1>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Explore relationships between extracted entities</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Link
              href="/dashboard/discover"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                textDecoration: 'none',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3l1.912 5.813a1 1 0 00.95.687h6.138l-4.962 3.6a1 1 0 00-.364 1.118L17.586 20l-4.95-3.6a1 1 0 00-1.176 0l-4.95 3.6 1.912-5.782a1 1 0 00-.364-1.118L3.096 9.5h6.138a1 1 0 00.95-.687L12 3z" />
              </svg>
              Discover more
            </Link>
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={isClearing || !stats || stats.total === 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#fff',
                color: isClearing || !stats || stats.total === 0 ? '#9ca3af' : '#dc2626',
                border: `1px solid ${isClearing || !stats || stats.total === 0 ? '#d1d5db' : '#dc2626'}`,
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: isClearing || !stats || stats.total === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {isClearing ? (
                <>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #dc2626', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Clearing...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Clear All
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem' }}>
        {/* Confirmation Dialog */}
        {showClearConfirm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111', marginBottom: '0.5rem' }}>
                Clear All Relationships?
              </h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
                This will permanently delete all {stats?.total || 0} relationships. This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#fff',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={clearAllRelationships}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear Result Message */}
        {clearResult && (
          <div style={{
            backgroundColor: clearResult.success ? '#f0fdf4' : '#fee2e2',
            border: `1px solid ${clearResult.success ? '#22c55e' : '#f87171'}`,
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              {clearResult.success ? (
                <p style={{ color: '#15803d', fontWeight: '600' }}>
                  Deleted {clearResult.deletedCount} relationships
                </p>
              ) : (
                <>
                  <p style={{ color: '#dc2626', fontWeight: '600' }}>
                    Failed to clear relationships
                  </p>
                  <p style={{ color: '#7f1d1d', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {clearResult.error}
                  </p>
                </>
              )}
            </div>
            <button
              onClick={() => setClearResult(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: clearResult.success ? '#15803d' : '#dc2626', fontSize: '1.25rem' }}
            >
              x
            </button>
          </div>
        )}

        {stats && stats.byType && Object.keys(stats.byType).length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ backgroundColor: '#fff', border: '2px solid #3b82f6', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e40af' }}>{stats.total}</div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total</div>
            </div>
            {Object.entries(stats.byType).slice(0, 5).map(([type, count]) => (
              <button key={type} onClick={() => setSelectedRelType(selectedRelType === type ? '' : type)}
                style={{ backgroundColor: selectedRelType === type ? '#eff6ff' : '#fff', border: `2px solid ${selectedRelType === type ? '#3b82f6' : '#e5e7eb'}`, borderRadius: '8px', padding: '1rem', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111' }}>{count}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{type.replace(/_/g, ' ')}</div>
              </button>
            ))}
          </div>
        )}

        {/* Entity Type Toggle Filters */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', margin: 0 }}>Show Entity Types</h4>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={showAllEntityTypes}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Show All
              </button>
              <button
                onClick={hideAllEntityTypes}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Hide All
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {ALL_ENTITY_TYPES.map((entityType) => {
              const colors = TYPE_COLORS[entityType] || { bg: '#f3f4f6', text: '#374151', border: '#9ca3af' };
              const isVisible = visibleEntityTypes.has(entityType);
              return (
                <button
                  key={entityType}
                  onClick={() => toggleEntityType(entityType)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.375rem 0.75rem',
                    backgroundColor: isVisible ? colors.bg : '#f9fafb',
                    border: `2px solid ${isVisible ? colors.border : '#e5e7eb'}`,
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: isVisible ? colors.text : '#9ca3af',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    opacity: isVisible ? 1 : 0.6,
                  }}
                >
                  <div style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: isVisible ? colors.border : '#d1d5db',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '8px',
                    fontWeight: '700',
                    color: '#fff',
                  }}>
                    {TYPE_ICONS[entityType] || '?'}
                  </div>
                  {entityType.replace('_', ' ')}
                  {isVisible && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* SAME_AS Highlight Toggle */}
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
            <button
              onClick={() => setHighlightSameAs(!highlightSameAs)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.375rem 0.75rem',
                backgroundColor: highlightSameAs ? '#fffbeb' : '#f9fafb',
                border: `2px solid ${highlightSameAs ? '#f59e0b' : '#e5e7eb'}`,
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: '500',
                color: highlightSameAs ? '#92400e' : '#6b7280',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Highlight Identity (SAME_AS) Relationships
              {highlightSameAs && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>Filter by Entity Type</label>
              <select value={selectedEntityType} onChange={(e) => setSelectedEntityType(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}>
                {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>Relationship Type</label>
              <select value={selectedRelType} onChange={(e) => setSelectedRelType(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }}>
                <option value="">All Relationships</option>
                {RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>Search</label>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search entities..."
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }} />
            </div>
          </div>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', border: '1px solid #f87171', borderRadius: '8px', padding: '1rem', marginBottom: '2rem' }}>
            <p style={{ color: '#dc2626', fontWeight: '600' }}>Error loading graph</p>
            <p style={{ color: '#7f1d1d', fontSize: '0.875rem' }}>{error}</p>
          </div>
        )}

        {isLoading && (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div style={{ display: 'inline-block', width: '40px', height: '40px', border: '4px solid #f3f4f6', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: '1rem', color: '#6b7280' }}>Loading relationship graph...</p>
          </div>
        )}

        {!isLoading && !error && filteredData && filteredData.nodes.length === 0 && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '3rem', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', backgroundColor: '#f3f4f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                <circle cx="5" cy="6" r="3" />
                <circle cx="19" cy="6" r="3" />
                <circle cx="12" cy="18" r="3" />
                <line x1="5" y1="9" x2="12" y2="15" />
                <line x1="19" y1="9" x2="12" y2="15" />
              </svg>
            </div>
            <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#374151' }}>No relationships found</p>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', maxWidth: '400px', margin: '0.5rem auto 1.5rem' }}>
              Use the Discover page to extract entities and relationships from your emails.
            </p>
            <Link
              href="/dashboard/discover"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '600',
                textDecoration: 'none',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3l1.912 5.813a1 1 0 00.95.687h6.138l-4.962 3.6a1 1 0 00-.364 1.118L17.586 20l-4.95-3.6a1 1 0 00-1.176 0l-4.95 3.6 1.912-5.782a1 1 0 00-.364-1.118L3.096 9.5h6.138a1 1 0 00.95-.687L12 3z" />
              </svg>
              Go to Discover
            </Link>
          </div>
        )}

        {!isLoading && !error && filteredData && filteredData.nodes.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', height: '600px', position: 'relative' }}>
              {/* Zoom Controls */}
              <div style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '8px',
                padding: '4px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              }}>
                <button
                  onClick={handleZoomIn}
                  title="Zoom In"
                  style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#374151',
                  }}
                >
                  +
                </button>
                <button
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#374151',
                  }}
                >
                  -
                </button>
                <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '2px 0' }} />
                <button
                  onClick={handleZoomReset}
                  title="Fit to View"
                  style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#374151',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </button>
                <button
                  onClick={handleCenterGraph}
                  title="Center Graph"
                  style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#374151',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                  </svg>
                </button>
              </div>

              {/* Graph Stats Overlay */}
              <div style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                zIndex: 10,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '0.75rem',
                color: '#6b7280',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              }}>
                <span style={{ fontWeight: '600', color: '#374151' }}>{filteredData.nodes.length}</span> nodes |{' '}
                <span style={{ fontWeight: '600', color: '#374151' }}>{filteredData.links.length}</span> edges |{' '}
                Zoom: <span style={{ fontWeight: '600', color: '#374151' }}>{Math.round(zoomLevel * 100)}%</span>
              </div>

              <ForceGraph2D
                ref={graphRef}
                graphData={filteredData}
                nodeCanvasObject={paintNode}
                nodeCanvasObjectMode={() => 'replace'}
                nodePointerAreaPaint={paintNodePointerArea}
                nodeLabel={generateNodeTooltip}
                linkCanvasObject={paintLink}
                linkCanvasObjectMode={() => 'replace'}
                linkLabel={(link: any) => `${link.type} (${Math.round(link.confidence * 100)}% confidence)`}
                onNodeClick={handleNodeClick}
                onLinkClick={handleLinkClick}
                onZoom={(transform: any) => setZoomLevel(transform.k)}
                warmupTicks={50}
                cooldownTicks={100}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
                onEngineStop={() => graphRef.current?.zoomToFit(400)}
              />
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem', height: '600px', overflowY: 'auto' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
                {selectedNode ? 'Node Details' : selectedEdge ? 'Relationship Details' : 'Select a node or edge'}
              </h3>

              {selectedNode && (
                <div>
                  <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600',
                    backgroundColor: TYPE_COLORS[selectedNode.type]?.bg || '#f3f4f6', color: TYPE_COLORS[selectedNode.type]?.text || '#374151', marginBottom: '0.75rem' }}>
                    {selectedNode.type}
                  </div>
                  <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111' }}>{selectedNode.value}</p>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>{selectedNode.connectionCount} connections</p>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: '600', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Relationships</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {getNodeEdges(selectedNode.id).map((edge, i) => {
                      const sourceId = getEdgeNodeId(edge.source);
                      const targetId = getEdgeNodeId(edge.target);
                      const otherNodeId = sourceId === selectedNode.id ? targetId : sourceId;
                      return (
                        <div key={i} style={{ padding: '0.5rem', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '0.75rem' }}>
                          <span style={{ fontWeight: '600' }}>{edge.type}</span>
                          <span style={{ color: '#6b7280' }}>{' -> '}{getNodeValue(otherNodeId)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedEdge && (
                <div>
                  <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#eff6ff', color: '#1e40af', marginBottom: '0.75rem' }}>
                    {selectedEdge.type}
                  </div>
                  <p style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.5rem' }}><strong>From:</strong> {getNodeValue(getEdgeNodeId(selectedEdge.source))}</p>
                  <p style={{ fontSize: '0.875rem', color: '#374151' }}><strong>To:</strong> {getNodeValue(getEdgeNodeId(selectedEdge.target))}</p>
                  <p style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.5rem' }}><strong>Confidence:</strong> {Math.round(selectedEdge.confidence * 100)}%</p>
                  {selectedEdge.evidence && (
                    <div style={{ marginTop: '1rem' }}>
                      <h4 style={{ fontSize: '0.875rem', fontWeight: '600' }}>Evidence</h4>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>{selectedEdge.evidence}</p>
                    </div>
                  )}
                </div>
              )}

              {!selectedNode && !selectedEdge && <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Click on a node or edge in the graph to see details.</p>}
            </div>
          </div>
        )}

        {!isLoading && filteredData && filteredData.nodes.length > 0 && (
          <div style={{ marginTop: '1.5rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.75rem' }}>Entity Types</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              {Object.entries(TYPE_COLORS).map(([type, colors]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: colors.bg,
                    border: `2px solid ${colors.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.625rem',
                    fontWeight: '700',
                    color: colors.border,
                  }}>
                    {TYPE_ICONS[type] || '?'}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'capitalize' }}>{type.replace('_', ' ')}</span>
                </div>
              ))}
            </div>

            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>Relationship Types</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {Object.entries(RELATIONSHIP_CATEGORIES).map(([category, config]) => (
                <div key={category} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="24" height="12" viewBox="0 0 24 12">
                    <line
                      x1="0"
                      y1="6"
                      x2="24"
                      y2="6"
                      stroke={config.color}
                      strokeWidth="2"
                      strokeDasharray={config.dashArray || 'none'}
                    />
                    {/* Arrowhead */}
                    <polygon
                      points="24,6 18,3 18,9"
                      fill={config.color}
                    />
                  </svg>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{config.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{
          marginTop: '1rem',
          fontSize: '0.75rem',
          color: '#9ca3af',
          textAlign: 'center'
        }}>
          v{BUILD_INFO.version} ({BUILD_INFO.gitHash?.slice(0, 7)})
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
