import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LANE_OPTIONS,
  laneLayout,
  type LaneLayoutNode,
} from './lane-layout';

const LANES = [
  'context',
  'requirements',
  'design',
  'decisions',
  'verification',
  'delivery',
];

const record = (id: string, lane: string, name = id): LaneLayoutNode => ({
  id,
  type: 'record',
  name,
  lane,
});
const page = (id: string, lane: string, name = id): LaneLayoutNode => ({
  id,
  type: 'page',
  name,
  lane,
});

describe('laneLayout', () => {
  it('puts every node of a lane in that lane, lanes left to right', () => {
    const { points, centers } = laneLayout(
      [
        page('ov', 'context'),
        page('req', 'requirements'),
        record('t1', 'verification'),
      ],
      LANES
    );
    const x = (id: string) => points.find((p) => p.id === id)!.x;
    expect(x('ov')).toBe(centers.context);
    expect(x('req')).toBe(centers.requirements);
    expect(x('t1')).toBe(centers.verification);
    expect(centers.context!).toBeLessThan(centers.requirements!);
    expect(centers.requirements!).toBeLessThan(centers.verification!);
    expect(centers.design).toBeUndefined();
  });

  it('lists the pages first, then the records in natural order', () => {
    const { points } = laneLayout(
      [
        record('b', 'requirements', 'HW-10 · Ten'),
        record('a', 'requirements', 'HW-2 · Two'),
        page('p', 'requirements', 'Requirements'),
      ],
      LANES
    );
    const order = [...points].sort((m, n) => m.y - n.y).map((p) => p.id);
    expect(order).toEqual(['p', 'a', 'b']);
  });

  it('wraps a long lane into sub-columns of at most maxRows', () => {
    const many = Array.from({ length: 95 }, (_, i) =>
      record(`r${i}`, 'requirements', `HW-${i}`)
    );
    const { points } = laneLayout(many, LANES);
    const columns = new Set(points.map((p) => p.x)).size;
    expect(columns).toBe(Math.ceil(95 / DEFAULT_LANE_OPTIONS.maxRows));
    const rows = new Set(points.map((p) => p.y)).size;
    expect(rows).toBeLessThanOrEqual(DEFAULT_LANE_OPTIONS.maxRows);
  });

  it('never places two nodes on the same spot', () => {
    const nodes = [
      ...Array.from({ length: 40 }, (_, i) => record(`r${i}`, 'requirements')),
      ...Array.from({ length: 30 }, (_, i) => record(`t${i}`, 'verification')),
      page('x', 'design'),
    ];
    const { points } = laneLayout(nodes, LANES);
    const spots = new Set(points.map((p) => `${p.x}|${p.y}`));
    expect(spots.size).toBe(nodes.length);
  });

  it('is centred on the origin and leaves room above for the titles', () => {
    const { points, top } = laneLayout(
      [page('a', 'context'), page('b', 'delivery')],
      LANES
    );
    const xs = points.map((p) => p.x);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0);
    expect(top).toBeLessThan(Math.min(...points.map((p) => p.y)));
  });

  it('sends a node with an unknown lane to the last lane rather than dropping it', () => {
    const { points, centers } = laneLayout([page('odd', 'nowhere')], LANES);
    expect(points).toHaveLength(1);
    expect(points[0]!.x).toBe(centers.delivery);
  });
});
