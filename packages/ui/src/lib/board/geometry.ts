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

// ----- smart alignment guides -------------------------------------------------
// A guide line the UI draws while dragging: an element edge/center is aligned
// with another element's edge/center. `axis: 'x'` is a vertical line at scene
// x = `pos`; `axis: 'y'` is a horizontal line at scene y = `pos`. `from`/`to`
// are the extent along the perpendicular axis so the overlay can span both the
// moving element and the element it snapped to.
export interface AlignGuide {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
}

export interface AlignResult {
  dx: number;
  dy: number;
  guides: AlignGuide[];
}

/**
 * Compute the smallest offset that snaps `moving` so one of its edges or its
 * center aligns with an edge/center of any rect in `others`, considering each
 * axis independently. `threshold` is the max scene-unit distance that still
 * snaps. Returns the offset to apply plus the guide lines to render. When
 * nothing is within threshold the offset is {0,0} and `guides` is empty.
 */
export const computeAlignmentSnap = (
  moving: Rect,
  others: Rect[],
  threshold: number
): AlignResult => {
  const movingXs = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const movingYs = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];

  let bestX: { delta: number; pos: number; other: Rect } | null = null;
  let bestY: { delta: number; pos: number; other: Rect } | null = null;

  for (const o of others) {
    const oxs = [o.x, o.x + o.w / 2, o.x + o.w];
    const oys = [o.y, o.y + o.h / 2, o.y + o.h];

    for (const mx of movingXs) {
      for (const ox of oxs) {
        const d = ox - mx;
        if (
          Math.abs(d) <= threshold &&
          (bestX === null || Math.abs(d) < Math.abs(bestX.delta))
        ) {
          bestX = { delta: d, pos: ox, other: o };
        }
      }
    }

    for (const my of movingYs) {
      for (const oy of oys) {
        const d = oy - my;
        if (
          Math.abs(d) <= threshold &&
          (bestY === null || Math.abs(d) < Math.abs(bestY.delta))
        ) {
          bestY = { delta: d, pos: oy, other: o };
        }
      }
    }
  }

  const dx = bestX ? bestX.delta : 0;
  const dy = bestY ? bestY.delta : 0;
  const guides: AlignGuide[] = [];

  if (bestX) {
    const m = { ...moving, x: moving.x + dx };
    guides.push({
      axis: 'x',
      pos: bestX.pos,
      from: Math.min(m.y, bestX.other.y),
      to: Math.max(m.y + m.h, bestX.other.y + bestX.other.h),
    });
  }
  if (bestY) {
    const m = { ...moving, y: moving.y + dy };
    guides.push({
      axis: 'y',
      pos: bestY.pos,
      from: Math.min(m.x, bestY.other.x),
      to: Math.max(m.x + m.w, bestY.other.x + bestY.other.w),
    });
  }

  return { dx, dy, guides };
};

/** SVG path for a connector between two points (straight segment). */
export const connectorPath = (start: Point, end: Point): string =>
  `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

export type ConnectorRouting = 'straight' | 'elbow' | 'curved';

const ELBOW_RADIUS = 14;

/** Point `dist` scene-units away from `from` toward `to`. */
const pointToward = (from: Point, to: Point, dist: number): Point => {
  const d = distance(from, to) || 1;
  const t = dist / d;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
};

/**
 * Quadratic control point for the default (no-bend) curved route: offset
 * perpendicular to the mid-line so the connector bows into a gentle arc.
 */
const defaultCurveControl = (start: Point, end: Point): Point => {
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = Math.min(80, len * 0.18);
  return { x: mid.x - (dy / len) * off, y: mid.y + (dx / len) * off };
};

/**
 * Orthogonal Z-route vertices (2 inner corners) through `bend`. Picks the
 * dominant axis: a mostly-horizontal connector routes with a vertical middle
 * segment at x = bend.x (default: the mid-x); mostly-vertical mirrors that.
 */
const elbowWaypoints = (start: Point, end: Point, bend?: Point): Point[] => {
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  if (horizontal) {
    const midX = bend ? bend.x : (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  const midY = bend ? bend.y : (start.y + end.y) / 2;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
};

/** SVG path over a polyline with small rounded (quadratic) corners. */
const roundedPath = (pts: Point[], radius: number): string => {
  if (pts.length < 2) {
    return '';
  }
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const curr = pts[i]!;
    const next = pts[i + 1]!;
    const r1 = Math.min(radius, distance(prev, curr) / 2);
    const r2 = Math.min(radius, distance(curr, next) / 2);
    const p1 = pointToward(curr, prev, r1);
    const p2 = pointToward(curr, next, r2);
    d += ` L ${p1.x} ${p1.y} Q ${curr.x} ${curr.y} ${p2.x} ${p2.y}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L ${last.x} ${last.y}`;
  return d;
};

/**
 * Polyline vertices approximating a connector for arrowhead tangents / straight
 * hit paths. Curved returns [start, control, end] so the neighbours give the
 * bezier's end tangents.
 */
export const connectorWaypoints = (
  routing: ConnectorRouting,
  start: Point,
  end: Point,
  bend?: Point
): Point[] => {
  if (routing === 'curved') {
    return [start, bend ?? defaultCurveControl(start, end), end];
  }
  if (routing === 'elbow') {
    return elbowWaypoints(start, end, bend);
  }
  return bend ? [start, bend, end] : [start, end];
};

/** SVG path `d` for a connector honouring its routing + optional reshape bend. */
export const buildConnectorPath = (
  routing: ConnectorRouting,
  start: Point,
  end: Point,
  bend?: Point
): string => {
  if (routing === 'curved') {
    const c = bend ?? defaultCurveControl(start, end);
    return `M ${start.x} ${start.y} Q ${c.x} ${c.y} ${end.x} ${end.y}`;
  }
  if (routing === 'elbow') {
    return roundedPath(elbowWaypoints(start, end, bend), ELBOW_RADIUS);
  }
  if (bend) {
    return `M ${start.x} ${start.y} L ${bend.x} ${bend.y} L ${end.x} ${end.y}`;
  }
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
};

/**
 * Where the single reshape handle sits: the bend when set, else the route's
 * visual midpoint (on-curve for `curved`, mid of the middle segment for
 * `elbow`, geometric mid for `straight`).
 */
export const connectorHandlePoint = (
  routing: ConnectorRouting,
  start: Point,
  end: Point,
  bend?: Point
): Point => {
  if (bend) {
    return bend;
  }
  if (routing === 'curved') {
    const c = defaultCurveControl(start, end);
    return {
      x: 0.25 * start.x + 0.5 * c.x + 0.25 * end.x,
      y: 0.25 * start.y + 0.5 * c.y + 0.25 * end.y,
    };
  }
  if (routing === 'elbow') {
    const pts = elbowWaypoints(start, end);
    const a = pts[1]!;
    const b = pts[2]!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
};

/** Penultimate route point, so the END arrowhead points along the last segment. */
export const connectorArrowFrom = (
  routing: ConnectorRouting,
  start: Point,
  end: Point,
  bend?: Point
): Point => {
  const pts = connectorWaypoints(routing, start, end, bend);
  return pts[pts.length - 2] ?? start;
};

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
