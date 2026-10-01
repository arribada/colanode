import { describe, expect, it } from 'vitest';

import {
  anchorPoint,
  arrowHeadPoints,
  arrowHeadShape,
  avoidWaypoints,
  buildConnectorPath,
  closestPointOnPolyline,
  connectorWaypoints,
  computeAlignmentSnap,
  connectorArrowFrom,
  distance,
  moveConnectorSegment,
  polylineCrossings,
  segmentIntersection,
  nearestAnchor,
  normalizeRect,
  pointInRotatedRect,
  pointsBounds,
  polylineHitTest,
  rectContainsRect,
  rectsIntersect,
  resizeRect,
  rotatePoint,
  snap,
  unionBounds,
} from '@colanode/ui/lib/board/geometry';

const rect = { x: 100, y: 100, w: 200, h: 100 };

describe('anchorPoint', () => {
  it('returns edge midpoints and center', () => {
    expect(anchorPoint(rect, 'top')).toEqual({ x: 200, y: 100 });
    expect(anchorPoint(rect, 'right')).toEqual({ x: 300, y: 150 });
    expect(anchorPoint(rect, 'bottom')).toEqual({ x: 200, y: 200 });
    expect(anchorPoint(rect, 'left')).toEqual({ x: 100, y: 150 });
    expect(anchorPoint(rect, 'center')).toEqual({ x: 200, y: 150 });
  });
});

describe('nearestAnchor', () => {
  it('picks the anchor closest to the target', () => {
    expect(nearestAnchor(rect, { x: 400, y: 150 })).toBe('right');
    expect(nearestAnchor(rect, { x: 200, y: -50 })).toBe('top');
    expect(nearestAnchor(rect, { x: 200, y: 400 })).toBe('bottom');
    expect(nearestAnchor(rect, { x: -50, y: 150 })).toBe('left');
  });
});

describe('rotatePoint', () => {
  it('rotates 90 degrees about a center', () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
  });
});

describe('pointInRotatedRect', () => {
  it('hit-tests an axis-aligned rect', () => {
    expect(pointInRotatedRect({ x: 150, y: 150 }, rect)).toBe(true);
    expect(pointInRotatedRect({ x: 350, y: 150 }, rect)).toBe(false);
  });

  it('accounts for rotation', () => {
    const square = { x: 0, y: 0, w: 100, h: 20 };
    // A point just outside the un-rotated top edge falls inside once the
    // rect is rotated 90 degrees about its center.
    const p = { x: 50, y: -30 };
    expect(pointInRotatedRect(p, square, 0)).toBe(false);
    expect(pointInRotatedRect(p, square, 90)).toBe(true);
  });
});

describe('rectsIntersect / rectContainsRect', () => {
  it('detects overlap for marquee selection', () => {
    expect(rectsIntersect(rect, { x: 150, y: 150, w: 10, h: 10 })).toBe(true);
    expect(rectsIntersect(rect, { x: 500, y: 500, w: 10, h: 10 })).toBe(false);
  });

  it('detects containment', () => {
    expect(rectContainsRect(rect, { x: 120, y: 120, w: 20, h: 20 })).toBe(
      true
    );
    expect(rectContainsRect(rect, { x: 120, y: 120, w: 400, h: 20 })).toBe(
      false
    );
  });
});

describe('unionBounds / pointsBounds', () => {
  it('unions rects', () => {
    expect(
      unionBounds([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 20, y: 5, w: 10, h: 30 },
      ])
    ).toEqual({ x: 0, y: 0, w: 30, h: 35 });
  });

  it('returns null for no rects', () => {
    expect(unionBounds([])).toBeNull();
  });

  it('bounds a point list', () => {
    expect(
      pointsBounds([
        [10, 20],
        [30, 5],
        [15, 40],
      ])
    ).toEqual({ x: 10, y: 5, w: 20, h: 35 });
  });
});

describe('resizeRect / normalizeRect', () => {
  it('resizes from the south-east handle', () => {
    expect(resizeRect(rect, 'se', 50, 20)).toEqual({
      x: 100,
      y: 100,
      w: 250,
      h: 120,
    });
  });

  it('resizes from the north-west handle keeping SE fixed', () => {
    expect(resizeRect(rect, 'nw', 50, 20)).toEqual({
      x: 150,
      y: 120,
      w: 150,
      h: 80,
    });
  });

  it('flips a negative rect', () => {
    expect(normalizeRect({ x: 100, y: 100, w: -40, h: -20 })).toEqual({
      x: 60,
      y: 80,
      w: 40,
      h: 20,
    });
  });
});

describe('snap', () => {
  it('snaps to the nearest grid multiple', () => {
    expect(snap(23, 10)).toBe(20);
    expect(snap(27, 10)).toBe(30);
    expect(snap(27, 0)).toBe(27);
  });
});

describe('computeAlignmentSnap', () => {
  const other = { x: 100, y: 100, w: 100, h: 100 };

  it('snaps a left edge onto another left edge within threshold', () => {
    const moving = { x: 104, y: 300, w: 60, h: 40 };
    const res = computeAlignmentSnap(moving, [other], 6);
    expect(res.dx).toBe(-4); // 100 - 104
    expect(res.guides.some((g) => g.axis === 'x' && g.pos === 100)).toBe(true);
  });

  it('snaps centers together', () => {
    // other centerX = 150; moving is 60 wide so centerX aligns when x = 120.
    const moving = { x: 123, y: 300, w: 60, h: 40 };
    const res = computeAlignmentSnap(moving, [other], 6);
    expect(moving.x + res.dx + moving.w / 2).toBe(150);
  });

  it('returns no snap and no guides when nothing is within threshold', () => {
    const moving = { x: 500, y: 500, w: 60, h: 40 };
    const res = computeAlignmentSnap(moving, [other], 6);
    expect(res.dx).toBe(0);
    expect(res.dy).toBe(0);
    expect(res.guides).toHaveLength(0);
  });

  it('picks the nearest candidate per axis independently', () => {
    const moving = { x: 197, y: 98, w: 40, h: 40 };
    const res = computeAlignmentSnap(moving, [other], 6);
    // x: nearest is other's right edge (200) -> dx = 3
    expect(res.dx).toBe(3);
    // y: nearest is other's top edge (100) -> dy = 2
    expect(res.dy).toBe(2);
  });
});

describe('arrowHeadPoints', () => {
  it('produces a triangle with the tip first', () => {
    const tip = { x: 100, y: 0 };
    const from = { x: 0, y: 0 };
    const pts = arrowHeadPoints(tip, from, 12);
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual(tip);
    // The two barbs sit behind the tip (smaller x) and straddle the axis.
    expect(pts[1]!.x).toBeLessThan(tip.x);
    expect(pts[2]!.x).toBeLessThan(tip.x);
    expect(Math.sign(pts[1]!.y)).not.toBe(Math.sign(pts[2]!.y));
    expect(distance(tip, pts[1]!)).toBeCloseTo(12, 0);
  });
});

describe('moveConnectorSegment', () => {
  // an elbow route: right out of A, across, then down into B
  const pts = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 100 },
    { x: 100, y: 100 },
  ];

  it('slides a vertical segment in x only', () => {
    const bends = moveConnectorSegment(pts, 1, { x: 20, y: 999 });
    expect(bends).toEqual([
      { x: 70, y: 0 },
      { x: 70, y: 100 },
    ]);
  });

  it('slides a horizontal segment in y only', () => {
    // segment 2 is the last one, so it touches the anchored endpoint: the
    // movement is absorbed by an inserted bend rather than detaching the end.
    const bends = moveConnectorSegment(pts, 2, { x: 999, y: -30 });
    expect(bends).toEqual([
      { x: 50, y: 0 },
      { x: 50, y: 70 },
      { x: 100, y: 70 },
    ]);
  });

  it('inserts a bend rather than detaching an anchored endpoint', () => {
    const bends = moveConnectorSegment(pts, 0, { x: 0, y: 15 });
    // the start point itself is untouched; a bend absorbs the movement
    expect(bends[0]).toEqual({ x: 0, y: 15 });
    expect(bends).toHaveLength(3);
  });

  it('returns the interior bends unchanged for an out-of-range index', () => {
    expect(moveConnectorSegment(pts, 9, { x: 5, y: 5 })).toEqual([
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ]);
  });
});

describe('line jumps', () => {
  it('finds the crossing of two segments', () => {
    const hit = segmentIntersection(
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      { x: 50, y: 0 },
      { x: 50, y: 100 }
    );
    expect(hit).toEqual({ x: 50, y: 50 });
  });

  it('returns null for parallel segments', () => {
    expect(
      segmentIntersection(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 10 },
        { x: 100, y: 10 }
      )
    ).toBeNull();
  });

  it('returns null when the lines would cross beyond the segments', () => {
    expect(
      segmentIntersection(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 50, y: -50 },
        { x: 50, y: 50 }
      )
    ).toBeNull();
  });

  it('collects every crossing along a polyline', () => {
    const pts = [
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ];
    const others = [
      [
        { x: 25, y: 0 },
        { x: 25, y: 100 },
      ],
      [
        { x: 75, y: 0 },
        { x: 75, y: 100 },
      ],
    ];
    expect(polylineCrossings(pts, others)).toEqual([
      { x: 25, y: 50 },
      { x: 75, y: 50 },
    ]);
  });

  it('draws an arc at a crossing and none without one', () => {
    const straight = buildConnectorPath(
      'straight',
      { x: 0, y: 50 },
      { x: 100, y: 50 }
    );
    expect(straight).not.toContain('A ');

    const hopped = buildConnectorPath(
      'straight',
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      undefined,
      undefined,
      [{ x: 50, y: 50 }]
    );
    expect(hopped).toContain('A 5 5 0 0 1');
    // enters the hop before the crossing and leaves it after
    expect(hopped).toContain('L 45 50');
    expect(hopped).toContain('55 50');
  });

  it('ignores a crossing too close to the end to hop cleanly', () => {
    const d = buildConnectorPath(
      'straight',
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      undefined,
      undefined,
      [{ x: 98, y: 0 }]
    );
    expect(d).not.toContain('A ');
  });
});

describe('polylineHitTest', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it('hits the middle of a segment, not only its ends', () => {
    // The whole point: a long stroke has two points far apart, and testing
    // only the vertices would leave most of it unhittable.
    expect(polylineHitTest(line, { x: 50, y: 3 }, 5)).toBe(true);
    expect(polylineHitTest(line, { x: 100, y: 50 }, 5)).toBe(true);
  });

  it('misses beyond the tolerance', () => {
    expect(polylineHitTest(line, { x: 50, y: 20 }, 5)).toBe(false);
  });

  it('handles a single-point stroke, which a tap produces', () => {
    expect(polylineHitTest([{ x: 10, y: 10 }], { x: 12, y: 10 }, 5)).toBe(true);
    expect(polylineHitTest([{ x: 10, y: 10 }], { x: 40, y: 10 }, 5)).toBe(
      false
    );
  });

  it('misses an empty stroke instead of throwing', () => {
    expect(polylineHitTest([], { x: 0, y: 0 }, 5)).toBe(false);
  });
});

describe('arrowHeadShape', () => {
  const tip = { x: 100, y: 0 };
  const from = { x: 0, y: 0 };

  it('draws nothing for none', () => {
    expect(arrowHeadShape('none', tip, from)).toBeNull();
  });

  it('points every head at the tip', () => {
    for (const kind of ['arrow', 'triangle', 'diamond'] as const) {
      const shape = arrowHeadShape(kind, tip, from)!;
      const hasTip = shape.points.some(
        (p) => Math.abs(p.x - tip.x) < 0.01 && Math.abs(p.y - tip.y) < 0.01
      );
      expect(hasTip, kind).toBe(true);
    }
  });

  it('leaves an open arrow unfilled and a triangle filled', () => {
    expect(arrowHeadShape('arrow', tip, from)!.filled).toBe(false);
    expect(arrowHeadShape('triangle', tip, from)!.filled).toBe(true);
  });

  it('puts the circle head behind the tip, not centred on it', () => {
    // Centred on the tip, half the disc would stick out past the line end.
    const shape = arrowHeadShape('circle', tip, from)!;
    expect(shape.circle!.c.x).toBeLessThan(tip.x);
    expect(shape.circle!.c.x + shape.circle!.r).toBeCloseTo(tip.x, 5);
  });

  it('builds the head around the line direction, not the axes', () => {
    // A head on a diagonal line must lean with it.
    const diagonal = arrowHeadShape('triangle', { x: 50, y: 50 }, { x: 0, y: 0 })!;
    const flat = arrowHeadShape('triangle', tip, from)!;
    expect(diagonal.points[0]!.y).not.toBeCloseTo(flat.points[0]!.y, 1);
  });
});

describe('connectorArrowFrom', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 100 };

  it('takes the penultimate point of a free elbow route', () => {
    // |dx| === |dy| leaves horizontally, so the last segment is horizontal and
    // the penultimate point sits level with the end: the head points sideways.
    expect(connectorArrowFrom('elbow', start, end)).toEqual({ x: 50, y: 100 });
  });

  it('leaves along the anchored exit side (perpendicular stub)', () => {
    // Forced to exit the top, the route leaves the start vertically and upward,
    // wherever the end sits — the exit side drives the geometry, not dx/dy.
    const pts = connectorWaypoints('elbow', start, end, undefined, 'top');
    expect(pts[1]!.x).toBe(start.x);
    expect(pts[1]!.y).toBeLessThan(start.y);
  });
});

describe('closestPointOnPolyline', () => {
  it('projects onto the nearest segment, not just the vertices', () => {
    // An L-shaped elbow: (0,0) -> (100,0) -> (100,100). A point beside the
    // horizontal leg must snap onto that leg, not to the far corner.
    const elbow = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(closestPointOnPolyline(elbow, { x: 40, y: 25 })).toEqual({
      x: 40,
      y: 0,
    });
    // A point beside the vertical leg snaps onto it.
    expect(closestPointOnPolyline(elbow, { x: 130, y: 60 })).toEqual({
      x: 100,
      y: 60,
    });
  });

  it('clamps to an endpoint when the point is past the ends', () => {
    const seg = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(closestPointOnPolyline(seg, { x: -50, y: 10 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('avoidWaypoints', () => {
  it('goes straight to the endpoint when nothing blocks the path', () => {
    expect(avoidWaypoints({ x: 0, y: 0 }, { x: 100, y: 0 }, [])).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it('detours around a box sitting on the straight path', () => {
    const start = { x: 0, y: 50 };
    const end = { x: 300, y: 50 };
    const box = { x: 120, y: 20, w: 60, h: 60 };
    const route = avoidWaypoints(start, end, [box]);
    expect(route[0]).toEqual(start);
    expect(route[route.length - 1]).toEqual(end);
    // every segment is axis-aligned
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!;
      const b = route[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
    // it actually had to bend (a clear path would be just the two endpoints)
    expect(route.length).toBeGreaterThan(2);
    // no vertex lands strictly inside the obstacle
    for (const p of route) {
      const inside =
        p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h;
      expect(inside).toBe(false);
    }
  });
});

describe('elbow stubs (entry/exit perpendicular)', () => {
  it('honours the entry side even when the exit would route otherwise', () => {
    // Same row, exit the start's right, but enter the end from BELOW. Without
    // the entry stub the line would arrive horizontally (penult.x === 0); the
    // entry side forces a vertical approach into the box from underneath.
    const pts = connectorWaypoints(
      'elbow',
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      undefined,
      'right',
      'bottom'
    );
    const last = pts[pts.length - 1]!;
    const penult = pts[pts.length - 2]!;
    expect(last).toEqual({ x: 200, y: 0 });
    expect(penult.x).toBe(200); // vertical approach, aligned with the end
    expect(penult.y).toBeGreaterThan(0); // from below
  });

  it('enters a top anchor from above (vertical last segment)', () => {
    const pts = connectorWaypoints(
      'elbow',
      { x: 0, y: 0 },
      { x: 120, y: 200 },
      undefined,
      'right',
      'top'
    );
    const last = pts[pts.length - 1]!;
    const penult = pts[pts.length - 2]!;
    expect(last).toEqual({ x: 120, y: 200 });
    expect(penult.x).toBe(120); // vertical approach
    expect(penult.y).toBeLessThan(200); // from above
  });
});
