// ABOUTME: Folds the leaves of a large graph into "+N" clusters on their one
// ABOUTME: neighbour, so a big neighbourhood draws as its structure. Pure.

export interface ClusterNode {
  id: string;
  type: string;
  name: string;
  degree: number;
}

export interface ClusterEdge {
  from: string;
  to: string;
  kind: string;
  label?: string;
}

export interface ClusterOptions {
  // Graphs at or below this many nodes are drawn whole.
  threshold: number;
  // Fewer leaves than this on one neighbour stay as they are: folding two
  // pages into "+2" hides more than it saves.
  minGroup: number;
  // Neighbours whose leaves the reader unfolded.
  expanded: ReadonlySet<string>;
  // Never folded (the page the graph is about).
  keep: ReadonlySet<string>;
}

export const CLUSTER_PREFIX = 'cluster:';

export interface ClusteredGraph<N extends ClusterNode, E extends ClusterEdge> {
  nodes: Array<N | ClusterNode>;
  edges: Array<E | ClusterEdge>;
  // Cluster id -> the ids it stands for.
  clusters: Record<string, string[]>;
}

export const clusterIdFor = (neighbourId: string): string =>
  `${CLUSTER_PREFIX}${neighbourId}`;

export const isClusterId = (id: string): boolean =>
  id.startsWith(CLUSTER_PREFIX);

export const neighbourOfCluster = (id: string): string =>
  id.slice(CLUSTER_PREFIX.length);

export const clusterLeaves = <N extends ClusterNode, E extends ClusterEdge>(
  graph: { nodes: readonly N[]; edges: readonly E[] },
  options: ClusterOptions
): ClusteredGraph<N, E> => {
  if (graph.nodes.length <= options.threshold) {
    return { nodes: [...graph.nodes], edges: [...graph.edges], clusters: {} };
  }

  const neighbours = new Map<string, Set<string>>();
  const touch = (a: string, b: string) => {
    const set = neighbours.get(a) ?? new Set<string>();
    set.add(b);
    neighbours.set(a, set);
  };
  for (const edge of graph.edges) {
    if (edge.from === edge.to) continue;
    touch(edge.from, edge.to);
    touch(edge.to, edge.from);
  }

  // Leaves grouped by the one node they hang from.
  const groups = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const around = neighbours.get(node.id);
    if (!around || around.size !== 1 || options.keep.has(node.id)) continue;
    const [neighbour] = [...around];
    if (!neighbour || options.expanded.has(neighbour)) continue;
    // Two leaves of each other (an isolated pair) are not a cluster.
    if ((neighbours.get(neighbour)?.size ?? 0) <= 1) continue;
    const list = groups.get(neighbour) ?? [];
    list.push(node.id);
    groups.set(neighbour, list);
  }

  const folded = new Map<string, string>();
  const clusters: Record<string, string[]> = {};
  for (const [neighbour, members] of groups) {
    if (members.length < options.minGroup) continue;
    const id = clusterIdFor(neighbour);
    clusters[id] = members;
    for (const member of members) folded.set(member, id);
  }

  if (folded.size === 0) {
    return { nodes: [...graph.nodes], edges: [...graph.edges], clusters: {} };
  }

  const nodes: Array<N | ClusterNode> = graph.nodes.filter(
    (n) => !folded.has(n.id)
  );
  for (const [id, members] of Object.entries(clusters)) {
    nodes.push({
      id,
      type: 'cluster',
      name: `+${members.length}`,
      degree: members.length,
    });
  }

  const edges: Array<E | ClusterEdge> = [];
  const clusterEdges = new Map<string, ClusterEdge>();
  for (const edge of graph.edges) {
    const from = folded.get(edge.from);
    const to = folded.get(edge.to);
    if (!from && !to) {
      edges.push(edge);
      continue;
    }
    // A folded leaf's one edge becomes the cluster's edge to its neighbour;
    // a mention wins over nesting so the cluster reads as linked.
    const clusterId = (from ?? to)!;
    const other = from ? edge.to : edge.from;
    const key = `${clusterId}|${other}`;
    const existing = clusterEdges.get(key);
    if (
      !existing ||
      (existing.kind === 'hierarchy' && edge.kind !== 'hierarchy')
    ) {
      clusterEdges.set(key, { from: other, to: clusterId, kind: edge.kind });
    }
  }
  edges.push(...clusterEdges.values());

  return { nodes, edges, clusters };
};

// Which nodes carry a label when the graph is large: the best connected, plus
// the ones the reader is looking at. Everything else shows its label on zoom.
export const labelledNodes = (
  nodes: ReadonlyArray<{ id: string; degree: number }>,
  options: { limit: number; always: ReadonlyArray<string | null | undefined> }
): Set<string> => {
  const ranked = [...nodes].sort(
    (a, b) => b.degree - a.degree || (a.id < b.id ? -1 : 1)
  );
  const set = new Set(ranked.slice(0, options.limit).map((n) => n.id));
  for (const id of options.always) {
    if (id) set.add(id);
  }
  return set;
};
