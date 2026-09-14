// ABOUTME: Pure graph construction for the knowledge graph — turns node rows and
// ABOUTME: mention references into a filtered node/edge set. No IO, no React.

export type GraphEdgeKind = 'link' | 'hierarchy';
export type GraphEdgeMode = 'links' | 'hierarchy' | 'both';

export interface GraphInputNode {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
}

export interface GraphInputReference {
  nodeId: string;
  referenceId: string;
}

export interface GraphNode {
  id: string;
  type: string;
  name: string;
  degree: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
}

export interface GraphUnresolved {
  from: string;
  target: string;
}

export interface NodeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  // Mentions whose target is not among the known nodes. Not necessarily deleted:
  // a node the viewer cannot access, or one not yet synced, looks identical from
  // here. The caller decides how to label them.
  unresolved: GraphUnresolved[];
}

export interface BuildGraphOptions {
  edgeMode: GraphEdgeMode;
  // Orphans are nodes with no edge at all. With hierarchy edges on almost
  // nothing is an orphan; with links only, most of a young wiki is.
  includeOrphans: boolean;
  // Local graph: keep only what is reachable from `nodeId` within `depth` hops,
  // walking edges in both directions. The focus node is always kept, even alone.
  focus?: { nodeId: string; depth: number };
}

const edgeKey = (edge: GraphEdge): string =>
  `${edge.kind}:${edge.from}>${edge.to}`;

export const buildGraph = (
  inputNodes: readonly GraphInputNode[],
  references: readonly GraphInputReference[],
  options: BuildGraphOptions
): NodeGraph => {
  const known = new Map<string, GraphInputNode>();
  for (const node of inputNodes) {
    known.set(node.id, node);
  }

  const unresolved: GraphUnresolved[] = [];
  const edgeMap = new Map<string, GraphEdge>();

  const wantsLinks = options.edgeMode === 'links' || options.edgeMode === 'both';
  const wantsHierarchy =
    options.edgeMode === 'hierarchy' || options.edgeMode === 'both';

  for (const reference of references) {
    if (!known.has(reference.nodeId)) {
      continue;
    }
    if (!known.has(reference.referenceId)) {
      unresolved.push({
        from: reference.nodeId,
        target: reference.referenceId,
      });
      continue;
    }
    if (reference.nodeId === reference.referenceId) {
      // A page mentioning itself is a loop no layout can draw usefully.
      continue;
    }
    if (!wantsLinks) {
      continue;
    }
    const edge: GraphEdge = {
      from: reference.nodeId,
      to: reference.referenceId,
      kind: 'link',
    };
    edgeMap.set(edgeKey(edge), edge);
  }

  if (wantsHierarchy) {
    for (const node of inputNodes) {
      if (!node.parentId || !known.has(node.parentId)) {
        continue;
      }
      const edge: GraphEdge = {
        from: node.parentId,
        to: node.id,
        kind: 'hierarchy',
      };
      edgeMap.set(edgeKey(edge), edge);
    }
  }

  let edges = [...edgeMap.values()];

  // Undirected adjacency: a graph is read as a neighbourhood, not as a flow.
  const neighbours = new Map<string, Set<string>>();
  const touch = (a: string, b: string) => {
    const set = neighbours.get(a) ?? new Set<string>();
    set.add(b);
    neighbours.set(a, set);
  };
  for (const edge of edges) {
    touch(edge.from, edge.to);
    touch(edge.to, edge.from);
  }

  let keep: Set<string>;
  if (options.focus) {
    const { nodeId, depth } = options.focus;
    keep = new Set<string>();
    if (known.has(nodeId)) {
      keep.add(nodeId);
      let frontier = [nodeId];
      for (let hop = 0; hop < Math.max(0, depth); hop++) {
        const next: string[] = [];
        for (const id of frontier) {
          for (const other of neighbours.get(id) ?? []) {
            if (!keep.has(other)) {
              keep.add(other);
              next.push(other);
            }
          }
        }
        if (next.length === 0) {
          break;
        }
        frontier = next;
      }
    }
    edges = edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to));
  } else {
    keep = new Set(known.keys());
  }

  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  const nodes: GraphNode[] = [];
  for (const id of keep) {
    const source = known.get(id);
    if (!source) {
      continue;
    }
    const d = degree.get(id) ?? 0;
    const isFocus = options.focus?.nodeId === id;
    if (d === 0 && !options.includeOrphans && !isFocus) {
      continue;
    }
    nodes.push({ id, type: source.type, name: source.name, degree: d });
  }

  // Stable order so a re-render never reshuffles the layout seed.
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const present = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => present.has(e.from) && present.has(e.to));
  edges.sort((a, b) => (edgeKey(a) < edgeKey(b) ? -1 : 1));

  return { nodes, edges, unresolved };
};
