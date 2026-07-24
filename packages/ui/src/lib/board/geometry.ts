// Pure geometry helpers for the board: anchors, connector routing + arrowheads,
// bounding boxes, rotation, hit-testing and resize math. No React / DOM here so
// the logic stays unit-testable.

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Anchor = 'top' | 'right' | 'bottom' | 'left' | 'center';

export const ANCHORS: Anchor[] = ['top', 'right', 'bottom', 'left'];

export const rectCenter = (r: Rect): Point => ({
  x: r.x + r.w / 2,
  y: r.y + r.h / 2,
});

/** Point on a rect for a named anchor. */
export const anchorPoint = (r: Rect, anchor: Anchor): Point => {
  switch (anchor) {
    case 'top':
      return { x: r.x + r.w / 2, y: r.y };
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h / 2 };
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h };
    case 'left':
      return { x: r.x, y: r.y + r.h / 2 };
    case 'center':
    default:
      return rectCenter(r);
  }
};

export const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Anchor on `r` whose point is closest to `target`. */
export const nearestAnchor = (r: Rect, target: Point): Anchor => {
  let best: Anchor = 'right';
  let bestDist = Infinity;
  for (const a of ANCHORS) {
    const d = distance(anchorPoint(r, a), target);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
};

/** Rotate `p` by `angleRad` around `center`. */
export const rotatePoint = (
  p: Point,
  center: Point,
  angleRad: number
): Point => {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
};

export const pointInRect = (p: Point, r: Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Hit-test a point against a possibly-rotated rect (rotation in degrees). */
export const pointInRotatedRect = (
  p: Point,
  r: Rect,
  rotationDeg = 0
): boolean => {
  if (!rotationDeg) {
    return pointInRect(p, r);
  }
  const local = rotatePoint(p, rectCenter(r), (-rotationDeg * Math.PI) / 180);
  return pointInRect(local, r);
};

export const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w &&
  a.x + a.w > b.x &&
  a.y < b.y + b.h &&
  a.y + a.h > b.y;

export const rectContainsRect = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

/** Axis-aligned bounding box that contains all rects. */
export const unionBounds = (rects: Rect[]): Rect | null => {
  if (rects.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

/** Bounding box of a freehand / point list. */
export const pointsBounds = (points: number[][]): Rect => {
  if (points.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x ?? 0);
    minY = Math.min(minY, y ?? 0);
    maxX = Math.max(maxX, x ?? 0);
    maxY = Math.max(maxY, y ?? 0);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

export type ResizeHandle =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w';

export const RESIZE_HANDLES: ResizeHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

/**
 * Apply a resize handle drag (dx, dy in scene units) to a rect. Keeps the
 * opposite edge/corner fixed. Width/height may go negative here; call
 * `normalizeRect` to flip.
 */
export const resizeRect = (
  r: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number
): Rect => {
  let { x, y, w, h } = r;
  if (handle.includes('w')) {
    x += dx;
    w -= dx;
  }
  if (handle.includes('e')) {
    w += dx;
  }
  if (handle.includes('n')) {
    y += dy;
    h -= dy;
  }
  if (handle.includes('s')) {
    h += dy;
  }
  return { x, y, w, h };
};

/** Flip a rect so width and height are non-negative. */
export const normalizeRect = (r: Rect): Rect => ({
  x: r.w < 0 ? r.x + r.w : r.x,
  y: r.h < 0 ? r.y + r.h : r.y,
  w: Math.abs(r.w),
  h: Math.abs(r.h),
});

export const snap = (value: number, grid: number): number =>
  grid > 0 ? Math.round(value / grid) * grid : value;

/** SVG path for a connector between two points (straight segment). */
export const connectorPath = (start: Point, end: Point): string =>
  `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

/**
 * Arrowhead as a triangle polygon at `tip`, pointing away from `from`.
 * Returns the three polygon points.
 */
export const arrowHeadPoints = (
  tip: Point,
  from: Point,
  size = 12
): Point[] => {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const spread = Math.PI / 7;
  return [
    tip,
    {
      x: tip.x - size * Math.cos(angle - spread),
      y: tip.y - size * Math.sin(angle - spread),
    },
    {
      x: tip.x - size * Math.cos(angle + spread),
      y: tip.y - size * Math.sin(angle + spread),
    },
  ];
};

export const pointsToSvg = (points: Point[]): string =>
  points.map((p) => `${p.x},${p.y}`).join(' ');
