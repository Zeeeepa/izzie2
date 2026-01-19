# Relationship Graph Visualization - Implementation Summary

## Overview
Interactive force-directed graph visualization for exploring relationships between extracted entities.

## Files Created/Modified

### Created
- `/src/app/dashboard/relationships/page.tsx` - Main visualization page

### Existing (Already in place)
- `/src/app/api/relationships/graph/route.ts` - Graph data API endpoint
- `/src/app/api/relationships/stats/route.ts` - Statistics API endpoint
- `/src/lib/weaviate/relationships.ts` - Weaviate relationship storage and graph building

## Features Implemented

### 1. Graph Visualization
- **Force-directed layout** using `react-force-graph` library
- **Interactive nodes** with click-to-select functionality
- **Color-coded by entity type** (matching entities dashboard):
  - Person: Blue (#3b82f6)
  - Company: Green (#22c55e)
  - Project: Yellow (#fbbf24)
  - Action Item: Red (#ef4444)
  - Topic: Purple (#a855f7)
  - Location: Pink (#ec4899)

### 2. Node Features
- **Size based on connections** - More connected nodes are larger
- **Hover labels** - Entity name shown on hover
- **Highlight on select** - Shows connected nodes and edges
- **Custom rendering** - Colored circles with text labels

### 3. Edge Features
- **Width based on weight** - Stronger relationships are thicker
- **Directional arrows** - Shows relationship direction
- **Highlight on select** - Emphasizes selected relationship
- **Type-based styling** - Different relationship types

### 4. Filtering
- **Entity type filter** - Show only specific entity types
- **Relationship type filter** - Show only specific relationship types
- **Search** - Filter by entity name
- **Real-time updates** - Graph updates as filters change

### 5. Details Panel
When selecting a node:
- Entity name and type
- Connection count
- List of all relationships

When selecting an edge:
- Relationship type
- Source and target entities
- Relationship weight/confidence
- Description (if available)

### 6. Statistics Cards
- Total count by relationship type
- Clickable cards for quick filtering
- Matches entities dashboard styling

### 7. Interactive Controls
- **Zoom and pan** - Navigate large graphs
- **Drag nodes** - Rearrange layout manually
- **Auto-fit** - Centers graph on load
- **Background click** - Deselect nodes/edges

### 8. States
- **Loading state** - Spinner while fetching data
- **Empty state** - Helpful message when no data
- **Error state** - Clear error messages with details

## Technical Details

### Dependencies
```bash
npm install react-force-graph --legacy-peer-deps
```

### API Integration
- `GET /api/relationships/graph` - Returns graph data with nodes and edges
- `GET /api/relationships/stats` - Returns relationship statistics

### Data Flow
1. Page loads → Fetches graph data and stats from APIs
2. User applies filters → Graph re-renders with filtered data
3. User clicks node/edge → Details panel updates
4. Graph auto-layouts using force simulation

### Styling Approach
- Inline styles matching entities dashboard pattern
- Consistent color scheme across platform
- Responsive grid layouts for stats cards
- Clean, minimal design language

## Usage

Navigate to `/dashboard/relationships` to view the relationship graph.

### Empty State
If no relationships are shown:
1. Extract entities from emails first (`/dashboard/entities`)
2. Run relationship inference (backend process)
3. Return to graph page to visualize

### Performance
- Supports up to 200 nodes (configurable in API)
- Force simulation optimized for smooth interaction
- Filters apply client-side for instant feedback

## Future Enhancements

Potential improvements:
- Export graph as image
- Advanced layout algorithms (hierarchical, circular)
- Temporal filtering (show relationships by date range)
- Relationship strength editing
- Clustering by entity type
- Mini-map for large graphs
- Search with autocomplete
- Graph comparison (before/after)

## Code Quality

### Type Safety
- Full TypeScript types for all data structures
- Interfaces matching API response formats
- Type-safe graph node and edge handling

### Performance
- Dynamic imports for heavy graph library (avoid SSR issues)
- Memoized graph data transformations
- Efficient filtering with Set operations

### User Experience
- Loading states for all async operations
- Error handling with user-friendly messages
- Keyboard navigation support (future)
- Mobile-responsive design (graph may need optimization)

## Integration Points

### With Entities Dashboard
- Shares color scheme and styling patterns
- Consistent user experience
- Cross-linking potential (future)

### With Weaviate
- Uses existing relationship storage
- Leverages graph building utilities
- Consistent data models

### With Auth
- Requires authentication
- User-scoped data only
- Session-based credentials
