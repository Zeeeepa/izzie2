/**
 * Topic Ontology Service
 *
 * Manages hierarchical topic relationships using LLM-powered classification.
 * Topics form a tree structure where child topics are subtopics of their parents.
 */

const LOG_PREFIX = '[Ontology]';

/**
 * A node in the topic ontology tree
 */
export interface OntologyNode {
  id: string;
  name: string;
  parentId?: string;
  children: OntologyNode[];
  depth: number;
  metadata?: {
    confidence?: number;
    createdAt: string;
    emailIds?: string[];
    occurrenceCount?: number;
  };
}

/**
 * Flattened topic with parent reference
 */
export interface TopicWithParent {
  id: string;
  name: string;
  parentName?: string;
  depth: number;
  path: string[]; // Full path from root
}

/**
 * LLM response for parent determination
 */
interface ParentDeterminationResult {
  parentTopic: string | null;
  confidence: number;
  reasoning: string;
}

export class OntologyService {
  private nodes: Map<string, OntologyNode> = new Map();
  private rootNodes: Set<string> = new Set();
  private llmEnabled: boolean;

  constructor(useLlm = true) {
    this.llmEnabled = useLlm;
    console.log(`${LOG_PREFIX} Initialized (LLM: ${useLlm ? 'enabled' : 'disabled'})`);
  }

  /**
   * Generate a unique node ID from topic name
   */
  private generateId(name: string): string {
    return `topic_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  }

  /**
   * Add a topic to the ontology
   */
  addTopic(
    name: string,
    parentName?: string,
    metadata?: OntologyNode['metadata']
  ): OntologyNode {
    const id = this.generateId(name);

    // Check if topic already exists
    let node = this.nodes.get(id);
    if (node) {
      // Update metadata if provided
      if (metadata) {
        node.metadata = { ...node.metadata, ...metadata };
      }
      return node;
    }

    // Determine parent
    let parentId: string | undefined;
    let depth = 0;

    if (parentName) {
      parentId = this.generateId(parentName);
      const parentNode = this.nodes.get(parentId);
      if (parentNode) {
        depth = parentNode.depth + 1;
      } else {
        // Create parent node if it doesn't exist
        const parent = this.addTopic(parentName);
        parentId = parent.id;
        depth = parent.depth + 1;
      }
    }

    // Create new node
    node = {
      id,
      name,
      parentId,
      children: [],
      depth,
      metadata: metadata || { createdAt: new Date().toISOString() },
    };

    this.nodes.set(id, node);

    // Add to parent's children or root nodes
    if (parentId) {
      const parentNode = this.nodes.get(parentId);
      if (parentNode) {
        parentNode.children.push(node);
      }
    } else {
      this.rootNodes.add(id);
    }

    console.log(
      `${LOG_PREFIX} Added topic: ${name}` +
      (parentName ? ` (parent: ${parentName})` : ' (root)')
    );

    return node;
  }

  /**
   * Determine the parent topic using LLM
   * Returns null if topic should be a root topic
   */
  async determineParent(
    topicName: string,
    existingTopics: string[]
  ): Promise<ParentDeterminationResult> {
    if (!this.llmEnabled || existingTopics.length === 0) {
      return {
        parentTopic: null,
        confidence: 1.0,
        reasoning: 'No existing topics or LLM disabled',
      };
    }

    // Use heuristic matching for common patterns
    const result = this.heuristicParentMatch(topicName, existingTopics);
    if (result.parentTopic) {
      return result;
    }

    // For now, use heuristic-only approach
    // TODO: Integrate with LLM for more sophisticated matching
    return {
      parentTopic: null,
      confidence: 0.5,
      reasoning: 'No clear parent found via heuristics',
    };
  }

  /**
   * Heuristic-based parent matching
   */
  private heuristicParentMatch(
    topicName: string,
    existingTopics: string[]
  ): ParentDeterminationResult {
    const normalizedTopic = topicName.toLowerCase();

    // Check for direct substring relationships
    for (const existing of existingTopics) {
      const normalizedExisting = existing.toLowerCase();

      // Check if new topic contains existing topic as prefix/suffix
      if (
        normalizedTopic.startsWith(normalizedExisting + ' ') ||
        normalizedTopic.endsWith(' ' + normalizedExisting)
      ) {
        return {
          parentTopic: existing,
          confidence: 0.8,
          reasoning: `"${topicName}" appears to be a subtopic of "${existing}"`,
        };
      }

      // Check for common tech hierarchy patterns
      const techHierarchies: Record<string, string[]> = {
        'programming': ['python', 'javascript', 'typescript', 'java', 'rust', 'go'],
        'machine learning': ['deep learning', 'neural networks', 'nlp', 'computer vision', 'rlhf'],
        'ai': ['machine learning', 'llm', 'artificial intelligence'],
        'web development': ['frontend', 'backend', 'fullstack', 'react', 'vue', 'angular'],
        'databases': ['sql', 'nosql', 'postgresql', 'mongodb', 'redis'],
        'cloud': ['aws', 'azure', 'gcp', 'kubernetes', 'docker'],
        'devops': ['ci/cd', 'jenkins', 'github actions', 'infrastructure'],
      };

      for (const [parent, children] of Object.entries(techHierarchies)) {
        if (normalizedExisting === parent) {
          for (const child of children) {
            if (normalizedTopic.includes(child)) {
              return {
                parentTopic: existing,
                confidence: 0.75,
                reasoning: `"${topicName}" is a known subtopic of "${existing}"`,
              };
            }
          }
        }
      }
    }

    return {
      parentTopic: null,
      confidence: 0.5,
      reasoning: 'No heuristic match found',
    };
  }

  /**
   * Add a topic with automatic parent determination
   */
  async addTopicWithAutoParent(
    name: string,
    metadata?: OntologyNode['metadata']
  ): Promise<OntologyNode> {
    const existingTopics = this.getAllTopicNames();
    const parentResult = await this.determineParent(name, existingTopics);

    const node = this.addTopic(
      name,
      parentResult.parentTopic || undefined,
      metadata
    );

    if (parentResult.parentTopic) {
      console.log(
        `${LOG_PREFIX} Auto-assigned parent "${parentResult.parentTopic}" ` +
        `to "${name}" (confidence: ${parentResult.confidence.toFixed(2)})`
      );
    }

    return node;
  }

  /**
   * Get a topic node by name
   */
  getTopic(name: string): OntologyNode | undefined {
    const id = this.generateId(name);
    return this.nodes.get(id);
  }

  /**
   * Get all topic names
   */
  getAllTopicNames(): string[] {
    const nodes = Array.from(this.nodes.values());
    return nodes.map((n) => n.name);
  }

  /**
   * Get all root topics (no parent)
   */
  getRootTopics(): OntologyNode[] {
    return Array.from(this.rootNodes)
      .map((id) => this.nodes.get(id))
      .filter((n): n is OntologyNode => n !== undefined);
  }

  /**
   * Get topic with its hierarchy information
   */
  getTopicWithHierarchy(name: string): TopicWithParent | undefined {
    const node = this.getTopic(name);
    if (!node) return undefined;

    const path: string[] = [];
    let current: OntologyNode | undefined = node;

    // Build path from current to root
    while (current) {
      path.unshift(current.name);
      if (current.parentId) {
        current = this.nodes.get(current.parentId);
      } else {
        current = undefined;
      }
    }

    const parentNode = node.parentId ? this.nodes.get(node.parentId) : undefined;

    return {
      id: node.id,
      name: node.name,
      parentName: parentNode?.name,
      depth: node.depth,
      path,
    };
  }

  /**
   * Get the full ontology tree
   */
  getOntologyTree(): OntologyNode[] {
    return this.getRootTopics();
  }

  /**
   * Get flattened list of all topics with hierarchy info
   */
  getAllTopicsFlat(): TopicWithParent[] {
    const result: TopicWithParent[] = [];
    const nodes = Array.from(this.nodes.values());

    for (const node of nodes) {
      const hierarchy = this.getTopicWithHierarchy(node.name);
      if (hierarchy) {
        result.push(hierarchy);
      }
    }

    // Sort by depth then name
    return result.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get hierarchy path as a formatted string
   */
  getHierarchyPath(name: string, separator = ' > '): string {
    const hierarchy = this.getTopicWithHierarchy(name);
    if (!hierarchy) return name;
    return hierarchy.path.join(separator);
  }

  /**
   * Export ontology to JSON
   */
  exportToJSON(): string {
    return JSON.stringify(
      {
        nodes: Array.from(this.nodes.values()),
        rootIds: Array.from(this.rootNodes),
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  }

  /**
   * Import ontology from JSON
   */
  importFromJSON(json: string): void {
    const data = JSON.parse(json);

    this.nodes.clear();
    this.rootNodes.clear();

    for (const nodeData of data.nodes) {
      // Reconstruct children arrays based on parentId relationships
      const node: OntologyNode = {
        ...nodeData,
        children: [],
      };
      this.nodes.set(node.id, node);

      if (!node.parentId) {
        this.rootNodes.add(node.id);
      }
    }

    // Rebuild children arrays
    const allNodes = Array.from(this.nodes.values());
    for (const node of allNodes) {
      if (node.parentId) {
        const parent = this.nodes.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        }
      }
    }

    console.log(`${LOG_PREFIX} Imported ${this.nodes.size} topics`);
  }

  /**
   * Clear all ontology data
   */
  clear(): void {
    this.nodes.clear();
    this.rootNodes.clear();
    console.log(`${LOG_PREFIX} Cleared ontology`);
  }

  /**
   * Get statistics about the ontology
   */
  getStats(): {
    totalTopics: number;
    rootTopics: number;
    maxDepth: number;
    avgDepth: number;
  } {
    const nodes = Array.from(this.nodes.values());
    const depths = nodes.map((n) => n.depth);

    return {
      totalTopics: this.nodes.size,
      rootTopics: this.rootNodes.size,
      maxDepth: depths.length > 0 ? Math.max(...depths) : 0,
      avgDepth:
        depths.length > 0
          ? depths.reduce((a, b) => a + b, 0) / depths.length
          : 0,
    };
  }
}

// Singleton instance
let ontologyServiceInstance: OntologyService | null = null;

export function getOntologyService(useLlm = true): OntologyService {
  if (!ontologyServiceInstance) {
    ontologyServiceInstance = new OntologyService(useLlm);
  }
  return ontologyServiceInstance;
}
