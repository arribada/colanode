import { describe, expect, it } from 'vitest';

import {
  clusterIdFor,
  clusterLeaves,
  labelledNodes,
  neighbourOfCluster,
} from './cluster';

const node = (id: string, degree = 1) => ({
  id,
  type: 'page',
  name: id,
  degree,
});
const nested = (from: string, to: string) => ({ from, to, kind: 'hierarchy' });
const link = (from: string, to: string) => ({ from, to, kind: 'link' });

// A hub with ten sub-pages, a second hub with two, linked to each other.
const graph = {
  nodes: [
    node('hub', 11),
    node('other', 3),
    ...Array.from({ length: 10 }, (_, i) => node(`leaf${i}`)),
    node('pair1'),
    node('pair2'),
  ],
  edges: [
    ...Array.from({ length: 10 }, (_, i) => nested('hub', `leaf${i}`)),
    link('hub', 'other'),
    nested('other', 'pair1'),
    nested('other', 'pair2'),
  ],
};

const options = {
  threshold: 5,
  minGroup: 3,
  expanded: new Set<string>(),
  keep: new Set<string>(),
};

describe('clusterLeaves', () => {
  it('draws a small graph whole', () => {
    const out = clusterLeaves(graph, { ...options, threshold: 100 });
    expect(out.nodes).toHaveLength(graph.nodes.length);
    expect(out.clusters).toEqual({});
  });

  it('folds the leaves of a hub into one cluster, keeping small groups', () => {
    const out = clusterLeaves(graph, options);
    const id = clusterIdFor('hub');
    expect(out.clusters[id]).toHaveLength(10);
    expect(out.nodes.map((n) => n.id).sort()).toEqual(
      [id, 'hub', 'other', 'pair1', 'pair2'].sort()
    );
    expect(out.nodes.find((n) => n.id === id)).toMatchObject({
      type: 'cluster',
      name: '+10',
      degree: 10,
    });
    expect(out.edges).toContainEqual({
      from: 'hub',
      to: id,
      kind: 'hierarchy',
    });
    expect(out.edges.filter((e) => e.to === id || e.from === id)).toHaveLength(
      1
    );
    expect(out.edges).toContainEqual(link('hub', 'other'));
  });

  it('unfolds a cluster the reader expanded', () => {
    const out = clusterLeaves(graph, {
      ...options,
      expanded: new Set(['hub']),
    });
    expect(out.clusters).toEqual({});
    expect(out.nodes.some((n) => n.id === 'leaf3')).toBe(true);
  });

  it('never folds the page the graph is about', () => {
    const out = clusterLeaves(graph, { ...options, keep: new Set(['leaf0']) });
    expect(out.clusters[clusterIdFor('hub')]).toHaveLength(9);
    expect(out.nodes.some((n) => n.id === 'leaf0')).toBe(true);
  });

  it('marks a cluster linked when one of its leaves was mentioned', () => {
    const withMention = {
      nodes: graph.nodes,
      edges: graph.edges.map((e) =>
        e.to === 'leaf0' ? link('hub', 'leaf0') : e
      ),
    };
    const out = clusterLeaves(withMention, options);
    expect(out.edges).toContainEqual({
      from: 'hub',
      to: clusterIdFor('hub'),
      kind: 'link',
    });
  });

  it('keeps an isolated pair as two nodes', () => {
    const pair = {
      nodes: [
        node('a'),
        node('b'),
        ...Array.from({ length: 6 }, (_, i) => node(`x${i}`, 0)),
      ],
      edges: [link('a', 'b')],
    };
    const out = clusterLeaves(pair, options);
    expect(out.clusters).toEqual({});
  });

  it('round-trips a cluster id to its neighbour', () => {
    expect(neighbourOfCluster(clusterIdFor('hub'))).toBe('hub');
  });
});

describe('labelledNodes', () => {
  it('labels the best connected and whatever the reader is looking at', () => {
    const set = labelledNodes(
      [node('a', 9), node('b', 1), node('c', 5), node('d', 0)],
      { limit: 2, always: ['d', null] }
    );
    expect([...set].sort()).toEqual(['a', 'c', 'd']);
  });
});
