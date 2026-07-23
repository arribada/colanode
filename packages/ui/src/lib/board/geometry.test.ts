import { describe, expect, it } from 'vitest';

import {
  anchorPoint,
  arrowHeadPoints,
  distance,
  nearestAnchor,
  normalizeRect,
  pointInRotatedRect,
  pointsBounds,
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
