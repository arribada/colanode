import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LAYOUT_OPTIONS,
  distance,
  layoutBounds,
  runLayout,
  seedPositions,
  stepLayout,
  type LayoutEdge,
} from '@colanode/ui/lib/graph/layout';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `n${i}`);

const finite = (points: { x: number; y: number }[]) =>
  points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

describe('seedPositions', () => {
  it('is deterministic: the same ids always give the same coordinates', () => {
    expect(seedPositions(ids(20))).toEqual(seedPositions(ids(20)));
  });

  it('never places two nodes on the same point', () => {
    const points = seedPositions(ids(60));
    const seen = new Set(points.map((p) => `${p.x.toFixed(6)}:${p.y.toFixed(6)}`));
    expect(seen.size).toBe(points.length);
  });

  it('starts at rest', () => {
    expect(seedPositions(ids(5)).every((p) => p.vx === 0 && p.vy === 0)).toBe(true);
  });
});

describe('stepLayout', () => {
  it('pushes two unconnected nodes apart', () => {
    const points = seedPositions(['a', 'b'], 5);
    const before = distance(points[0]!, points[1]!);
    runLayout(points, [], 40);
    expect(distance(points[0]!, points[1]!)).toBeGreaterThan(before);
  });

  it('pulls two connected nodes toward the link distance', () => {
    const edges: LayoutEdge[] = [{ from: 'a', to: 'b' }];
    // Start them far apart so the spring has to pull them IN, which repulsion
    // alone could never do.
    const points = seedPositions(['a', 'b'], 600);
    const before = distance(points[0]!, points[1]!);
    runLayout(points, edges, 400);
    const after = distance(points[0]!, points[1]!);
    expect(after).toBeLessThan(before);
    expect(after).toBeLessThan(before / 2);
  });

  it('settles instead of oscillating for ever', () => {
    const points = seedPositions(ids(25));
    const edges: LayoutEdge[] = ids(24).map((_, i) => ({
      from: `n${i}`,
      to: `n${i + 1}`,
    }));
    const early = runLayout(points, edges, 20);
    const late = runLayout(points, edges, 400);
    expect(late).toBeLessThan(early);
  });

  it('produces no NaN, even when every node starts stacked on one point', () => {
    const points = ids(8).map((id) => ({ id, x: 0, y: 0, vx: 0, vy: 0 }));
    runLayout(points, [{ from: 'n0', to: 'n1' }], 100);
    expect(finite(points)).toBe(true);
  });

  it('ignores an edge pointing at a node that is not in the layout', () => {
    const points = seedPositions(['a', 'b']);
    expect(() =>
      runLayout(points, [{ from: 'a', to: 'ghost' }], 10)
    ).not.toThrow();
    expect(finite(points)).toBe(true);
  });

  it('does nothing, and does not throw, on an empty graph', () => {
    expect(stepLayout([], [], DEFAULT_LAYOUT_OPTIONS)).toBe(0);
  });

  it('keeps a disconnected node from drifting away for ever', () => {
    const points = seedPositions(ids(6), 30);
    runLayout(points, [], 600);
    const bounds = layoutBounds(points);
    const extent = Math.max(
      Math.abs(bounds.minX),
      Math.abs(bounds.maxX),
      Math.abs(bounds.minY),
      Math.abs(bounds.maxY)
    );
    // Without the centering force this grows without bound.
    expect(extent).toBeLessThan(5000);
  });
});

describe('layoutBounds', () => {
  it('returns a zero box for no points', () => {
    expect(layoutBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('frames every point', () => {
    const points = [
      { id: 'a', x: -5, y: 2, vx: 0, vy: 0 },
      { id: 'b', x: 7, y: -3, vx: 0, vy: 0 },
    ];
    expect(layoutBounds(points)).toEqual({
      minX: -5,
      minY: -3,
      maxX: 7,
      maxY: 2,
    });
  });
});
