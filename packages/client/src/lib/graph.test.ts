import { describe, expect, it } from 'vitest';

import {
  buildGraph,
  type GraphInputNode,
  type GraphInputReference,
} from '@colanode/client/lib/graph';

const node = (
  id: string,
  parentId: string | null = null,
  name = id
): GraphInputNode => ({ id, type: 'page', name, parentId });

const ref = (from: string, to: string): GraphInputReference => ({
  nodeId: from,
  referenceId: to,
});

describe('buildGraph', () => {
  it('turns mentions into link edges and counts degree on both ends', () => {
    const g = buildGraph([node('a'), node('b')], [ref('a', 'b')], {
      edgeMode: 'links',
      includeOrphans: true,
    });
    expect(g.edges).toEqual([{ from: 'a', to: 'b', kind: 'link' }]);
    expect(g.nodes.map((n) => [n.id, n.degree])).toEqual([
      ['a', 1],
      ['b', 1],
    ]);
  });

  it('reports a mention whose target is unknown instead of dropping it silently', () => {
    const g = buildGraph([node('a')], [ref('a', 'ghost')], {
      edgeMode: 'links',
      includeOrphans: true,
    });
    expect(g.edges).toHaveLength(0);
    expect(g.unresolved).toEqual([{ from: 'a', target: 'ghost' }]);
  });

  it('ignores a node mentioning itself', () => {
    const g = buildGraph([node('a')], [ref('a', 'a')], {
      edgeMode: 'links',
      includeOrphans: true,
    });
    expect(g.edges).toHaveLength(0);
    expect(g.unresolved).toHaveLength(0);
  });

  it('builds hierarchy edges from parentId, and only when asked', () => {
    const nodes = [node('root'), node('child', 'root')];
    const withHierarchy = buildGraph(nodes, [], {
      edgeMode: 'hierarchy',
      includeOrphans: true,
    });
    expect(withHierarchy.edges).toEqual([
      { from: 'root', to: 'child', kind: 'hierarchy' },
    ]);

    const linksOnly = buildGraph(nodes, [], {
      edgeMode: 'links',
      includeOrphans: true,
    });
    expect(linksOnly.edges).toHaveLength(0);
  });

  it('keeps both kinds in `both` mode without merging them', () => {
    const g = buildGraph(
      [node('a'), node('b', 'a')],
      [ref('a', 'b')],
      { edgeMode: 'both', includeOrphans: true }
    );
    expect(g.edges.map((e) => e.kind).sort()).toEqual(['hierarchy', 'link']);
  });

  it('drops orphans unless asked to keep them', () => {
    const nodes = [node('a'), node('b'), node('lonely')];
    const kept = buildGraph(nodes, [ref('a', 'b')], {
      edgeMode: 'links',
      includeOrphans: true,
    });
    expect(kept.nodes.map((n) => n.id)).toEqual(['a', 'b', 'lonely']);

    const dropped = buildGraph(nodes, [ref('a', 'b')], {
      edgeMode: 'links',
      includeOrphans: false,
    });
    expect(dropped.nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('keeps the focus node even when it has no edge at all', () => {
    const g = buildGraph([node('a'), node('b')], [], {
      edgeMode: 'links',
      includeOrphans: false,
      focus: { nodeId: 'a', depth: 2 },
    });
    expect(g.nodes.map((n) => n.id)).toEqual(['a']);
  });

  it('walks the local graph in both directions up to depth', () => {
    // c -> b -> a  : from a, depth 1 reaches b, depth 2 reaches c.
    const nodes = [node('a'), node('b'), node('c'), node('far')];
    const refs = [ref('b', 'a'), ref('c', 'b'), ref('far', 'c')];

    const d1 = buildGraph(nodes, refs, {
      edgeMode: 'links',
      includeOrphans: true,
      focus: { nodeId: 'a', depth: 1 },
    });
    expect(d1.nodes.map((n) => n.id)).toEqual(['a', 'b']);

    const d2 = buildGraph(nodes, refs, {
      edgeMode: 'links',
      includeOrphans: true,
      focus: { nodeId: 'a', depth: 2 },
    });
    expect(d2.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('never returns an edge whose endpoint was filtered out', () => {
    const g = buildGraph(
      [node('a'), node('b'), node('c')],
      [ref('a', 'b'), ref('b', 'c')],
      { edgeMode: 'links', includeOrphans: true, focus: { nodeId: 'a', depth: 1 } }
    );
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const edge of g.edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
  });

  it('deduplicates repeated mentions between the same two pages', () => {
    const g = buildGraph([node('a'), node('b')], [ref('a', 'b'), ref('a', 'b')], {
      edgeMode: 'links',
      includeOrphans: true,
    });
    expect(g.edges).toHaveLength(1);
    expect(g.nodes.find((n) => n.id === 'a')?.degree).toBe(1);
  });

  it('orders nodes and edges deterministically', () => {
    const nodes = [node('c'), node('a'), node('b')];
    const refs = [ref('c', 'a'), ref('a', 'b')];
    const first = buildGraph(nodes, refs, {
      edgeMode: 'links',
      includeOrphans: true,
    });
    const second = buildGraph([...nodes].reverse(), [...refs].reverse(), {
      edgeMode: 'links',
      includeOrphans: true,
    });
    expect(second.nodes).toEqual(first.nodes);
    expect(second.edges).toEqual(first.edges);
  });
});

describe('buildGraph — the cap that keeps a big wiki drawable', () => {
  // A hub every other node points at, so degrees differ and the ranking has a
  // defensible answer: the hub first, then the pages that mention it.
  const nodes = Array.from({ length: 30 }, (_, i) => ({
    id: `n${String(i).padStart(2, '0')}`,
    type: 'page',
    name: `Page ${i}`,
    parentId: null,
  }));
  const references = nodes
    .slice(1)
    .map((node) => ({ nodeId: node.id, referenceId: 'n00' }));

  it('draws everything when the graph is small enough', () => {
    const graph = buildGraph(nodes, references, {
      edgeMode: 'links',
      includeOrphans: true,
      maxNodes: 100,
    });

    expect(graph.nodes).toHaveLength(30);
    expect(graph.truncated).toBeUndefined();
  });

  it('keeps the best connected and says how many it left out', () => {
    const graph = buildGraph(nodes, references, {
      edgeMode: 'links',
      includeOrphans: true,
      maxNodes: 10,
    });

    expect(graph.nodes).toHaveLength(10);
    expect(graph.truncated).toEqual({ shown: 10, total: 30 });
    expect(graph.nodes.map((n) => n.id)).toContain('n00');
  });

  it('never drops the page the graph was opened from', () => {
    const graph = buildGraph(nodes, references, {
      edgeMode: 'links',
      includeOrphans: true,
      focus: { nodeId: 'n29', depth: 3 },
      maxNodes: 3,
    });

    expect(graph.nodes.map((n) => n.id)).toContain('n29');
    expect(graph.nodes).toHaveLength(3);
  });

  it('leaves no edge pointing at a node it dropped', () => {
    const graph = buildGraph(nodes, references, {
      edgeMode: 'links',
      includeOrphans: true,
      maxNodes: 5,
    });

    const present = new Set(graph.nodes.map((n) => n.id));
    for (const edge of graph.edges) {
      expect(present.has(edge.from)).toBe(true);
      expect(present.has(edge.to)).toBe(true);
    }
  });
});
