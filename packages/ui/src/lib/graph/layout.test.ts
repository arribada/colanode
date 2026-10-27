import { describe, expect, it } from 'vitest';

import {
  carryPositions,
  DEFAULT_LAYOUT_OPTIONS,
  distance,
  fitView,
  layoutBounds,
  runLayout,
  seedPositions,
  stepLayout,
  zoomAt,
  type LayoutEdge,
  type LayoutPoint,
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

describe('carryPositions', () => {
  const at = (id: string, x: number, y: number): LayoutPoint => ({
    id,
    x,
    y,
    vx: 3,
    vy: -2,
  });

  it('leaves every node that was already drawn exactly where it was', () => {
    const previous = [at('a', 10, 20), at('b', -40, 5), at('gone', 99, 99)];
    const next = carryPositions(
      previous,
      ['a', 'b', 'new'],
      [{ from: 'a', to: 'new' }]
    );
    expect(next.find((p) => p.id === 'a')).toMatchObject({ x: 10, y: 20 });
    expect(next.find((p) => p.id === 'b')).toMatchObject({ x: -40, y: 5 });
    expect(next.map((p) => p.id)).toEqual(['a', 'b', 'new']);
  });

  it('drops the momentum of the last layout', () => {
    const next = carryPositions([at('a', 1, 2)], ['a'], []);
    expect(next[0]).toMatchObject({ vx: 0, vy: 0 });
  });

  it('starts a new node next to the neighbour it already has on screen', () => {
    const previous = [at('hub', 500, 500), at('other', -500, -500)];
    const next = carryPositions(
      previous,
      ['hub', 'other', 'leaf'],
      [{ from: 'hub', to: 'leaf' }],
      40
    );
    const leaf = next.find((p) => p.id === 'leaf')!;
    const hub = next.find((p) => p.id === 'hub')!;
    const other = next.find((p) => p.id === 'other')!;
    expect(distance(leaf, hub)).toBeCloseTo(40, 6);
    expect(distance(leaf, other)).toBeGreaterThan(1000);
  });

  it('unrolls a chain of new nodes outward from the drawn one', () => {
    const next = carryPositions(
      [at('a', 0, 0)],
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
      40
    );
    const [a, b, c] = next;
    expect(distance(a!, b!)).toBeCloseTo(40, 6);
    expect(distance(b!, c!)).toBeCloseTo(40, 6);
    expect(finite(next)).toBe(true);
  });

  it('puts a new node with no drawn neighbour outside the current picture', () => {
    const previous = [at('a', 30, 0), at('b', -30, 0)];
    const next = carryPositions(previous, ['a', 'b', 'island'], [], 40);
    const island = next.find((p) => p.id === 'island')!;
    expect(Math.hypot(island.x, island.y)).toBeGreaterThan(30);
  });

  it('falls back to the seed spiral when nothing carries over', () => {
    expect(carryPositions([at('x', 1, 1)], ['a', 'b'], [], 40)).toEqual(
      seedPositions(['a', 'b'], 40)
    );
  });

  it('does not depend on the order the edges come in', () => {
    const previous = [at('a', 0, 0)];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ];
    const forward = carryPositions(previous, ['a', 'b', 'c'], edges);
    const backward = carryPositions(
      previous,
      ['a', 'b', 'c'],
      [...edges].reverse()
    );
    expect(backward).toEqual(forward);
  });
});

describe('fitView', () => {
  const frames = (
    points: LayoutPoint[],
    width: number,
    height: number
  ): boolean => {
    const view = fitView(layoutBounds(points), width, height);
    return points.every((p) => {
      const sx = view.x + p.x * view.zoom;
      const sy = view.y + p.y * view.zoom;
      return Math.abs(sx) <= width / 2 && Math.abs(sy) <= height / 2;
    });
  };

  it('zooms out until a graph wider than the pane fits in it', () => {
    const points = [
      { id: 'a', x: -2000, y: 0, vx: 0, vy: 0 },
      { id: 'b', x: 2400, y: 300, vx: 0, vy: 0 },
    ];
    expect(frames(points, 1300, 850)).toBe(true);
    expect(fitView(layoutBounds(points), 1300, 850).zoom).toBeLessThan(1);
  });

  it('recentres an off-centre graph', () => {
    const view = fitView(
      { minX: 100, minY: 100, maxX: 200, maxY: 200 },
      800,
      600
    );
    expect(view.x + 150 * view.zoom).toBeCloseTo(0, 6);
    expect(view.y + 150 * view.zoom).toBeCloseTo(0, 6);
  });

  it('never blows a small graph up past the default zoom', () => {
    expect(
      fitView({ minX: -5, minY: -5, maxX: 5, maxY: 5 }, 1300, 850).zoom
    ).toBe(1);
  });

  it('survives a single point and a pane smaller than its padding', () => {
    const view = fitView({ minX: 3, minY: 3, maxX: 3, maxY: 3 }, 40, 40);
    expect(Number.isFinite(view.x) && Number.isFinite(view.zoom)).toBe(true);
  });
});

describe('zoomAt', () => {
  it('keeps the point under the cursor in place', () => {
    const view = { x: 40, y: -25, zoom: 0.8 };
    const sceneX = (120 - view.x) / view.zoom;
    const sceneY = (60 - view.y) / view.zoom;
    const next = zoomAt(view, 1.12, 120, 60);
    expect(next.x + sceneX * next.zoom).toBeCloseTo(120, 6);
    expect(next.y + sceneY * next.zoom).toBeCloseTo(60, 6);
  });

  it('stops at the zoom limits', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 3.9 }, 2, 0, 0).zoom).toBe(4);
    expect(zoomAt({ x: 0, y: 0, zoom: 0.13 }, 0.5, 0, 0).zoom).toBe(0.12);
  });
});
