// The extra shape catalogue: everything past rectangle / ellipse / diamond.
//
// A shape is a PATH over the element's own bounding box, not a new element
// type. That way resize, rotation, text, connectors, hit testing and z-order
// all keep working untouched, and an old client that does not know a shape
// still draws a sensible rectangle rather than nothing at all.

export interface ShapeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BoardShapeId =
  | 'roundRect'
  | 'stadium'
  | 'triangle'
  | 'triangleDown'
  | 'parallelogram'
  | 'trapezoid'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'cylinder'
  | 'cloud'
  | 'arrowRight'
  | 'cross'
  | 'process'
  | 'document';

export interface BoardShapeDef {
  id: BoardShapeId;
  label: string;
  path: (r: ShapeRect) => string;
}

const pts = (points: [number, number][]): string =>
  'M ' + points.map(([x, y]) => `${round(x)} ${round(y)}`).join(' L ') + ' Z';

// Two decimals: enough for a 4k canvas, and it keeps the stored path short.
const round = (n: number): number => Math.round(n * 100) / 100;

/** Regular polygon inscribed in the box, first vertex pointing up. */
const polygon = (r: ShapeRect, sides: number): string => {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const out: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    out.push([cx + (r.w / 2) * Math.cos(a), cy + (r.h / 2) * Math.sin(a)]);
  }
  return pts(out);
};

export const BOARD_SHAPES: BoardShapeDef[] = [
  {
    id: 'roundRect',
    label: 'Rounded rectangle',
    path: (r) => {
      // Radius from the SHORT side, so a wide flat box does not end up with
      // corners rounder than it is tall.
      const rad = Math.min(24, Math.min(r.w, r.h) / 4);
      return (
        `M ${round(r.x + rad)} ${round(r.y)} H ${round(r.x + r.w - rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + r.w)} ${round(r.y + rad)}` +
        ` V ${round(r.y + r.h - rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + r.w - rad)} ${round(r.y + r.h)}` +
        ` H ${round(r.x + rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x)} ${round(r.y + r.h - rad)}` +
        ` V ${round(r.y + rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + rad)} ${round(r.y)} Z`
      );
    },
  },
  {
    id: 'stadium',
    label: 'Pill',
    path: (r) => {
      const rad = Math.min(r.w, r.h) / 2;
      return (
        `M ${round(r.x + rad)} ${round(r.y)} H ${round(r.x + r.w - rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + r.w - rad)} ${round(r.y + r.h)}` +
        ` H ${round(r.x + rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + rad)} ${round(r.y)} Z`
      );
    },
  },
  {
    id: 'triangle',
    label: 'Triangle',
    path: (r) =>
      pts([
        [r.x + r.w / 2, r.y],
        [r.x + r.w, r.y + r.h],
        [r.x, r.y + r.h],
      ]),
  },
  {
    id: 'triangleDown',
    label: 'Triangle down',
    path: (r) =>
      pts([
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x + r.w / 2, r.y + r.h],
      ]),
  },
  {
    id: 'parallelogram',
    label: 'Parallelogram',
    path: (r) => {
      const skew = Math.min(r.w / 4, 40);
      return pts([
        [r.x + skew, r.y],
        [r.x + r.w, r.y],
        [r.x + r.w - skew, r.y + r.h],
        [r.x, r.y + r.h],
      ]);
    },
  },
  {
    id: 'trapezoid',
    label: 'Trapezoid',
    path: (r) => {
      const inset = Math.min(r.w / 5, 40);
      return pts([
        [r.x + inset, r.y],
        [r.x + r.w - inset, r.y],
        [r.x + r.w, r.y + r.h],
        [r.x, r.y + r.h],
      ]);
    },
  },
  { id: 'pentagon', label: 'Pentagon', path: (r) => polygon(r, 5) },
  { id: 'hexagon', label: 'Hexagon', path: (r) => polygon(r, 6) },
  { id: 'octagon', label: 'Octagon', path: (r) => polygon(r, 8) },
  {
    id: 'star',
    label: 'Star',
    path: (r) => {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const out: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const k = i % 2 === 0 ? 1 : 0.42;
        out.push([
          cx + (r.w / 2) * k * Math.cos(a),
          cy + (r.h / 2) * k * Math.sin(a),
        ]);
      }
      return pts(out);
    },
  },
  {
    id: 'cylinder',
    label: 'Cylinder',
    path: (r) => {
      // Cap depth capped at a third of the height, or a short cylinder turns
      // into two overlapping ellipses.
      const ry = Math.min(r.h / 3, r.w / 6, 22);
      const rx = r.w / 2;
      return (
        `M ${round(r.x)} ${round(r.y + ry)}` +
        ` A ${round(rx)} ${round(ry)} 0 0 1 ${round(r.x + r.w)} ${round(r.y + ry)}` +
        ` V ${round(r.y + r.h - ry)}` +
        ` A ${round(rx)} ${round(ry)} 0 0 1 ${round(r.x)} ${round(r.y + r.h - ry)} Z` +
        ` M ${round(r.x)} ${round(r.y + ry)}` +
        ` A ${round(rx)} ${round(ry)} 0 0 0 ${round(r.x + r.w)} ${round(r.y + ry)}`
      );
    },
  },
  {
    id: 'cloud',
    label: 'Cloud',
    path: (r) => {
      const w = r.w;
      const h = r.h;
      const x = r.x;
      const y = r.y;
      return (
        `M ${round(x + w * 0.25)} ${round(y + h * 0.8)}` +
        ` A ${round(w * 0.18)} ${round(h * 0.22)} 0 0 1 ${round(x + w * 0.2)} ${round(y + h * 0.42)}` +
        ` A ${round(w * 0.2)} ${round(h * 0.26)} 0 0 1 ${round(x + w * 0.45)} ${round(y + h * 0.24)}` +
        ` A ${round(w * 0.22)} ${round(h * 0.28)} 0 0 1 ${round(x + w * 0.78)} ${round(y + h * 0.36)}` +
        ` A ${round(w * 0.16)} ${round(h * 0.24)} 0 0 1 ${round(x + w * 0.78)} ${round(y + h * 0.8)} Z`
      );
    },
  },
  {
    id: 'arrowRight',
    label: 'Block arrow',
    path: (r) => {
      const head = Math.min(r.w / 3, r.h);
      const shaft = r.h / 4;
      return pts([
        [r.x, r.y + shaft],
        [r.x + r.w - head, r.y + shaft],
        [r.x + r.w - head, r.y],
        [r.x + r.w, r.y + r.h / 2],
        [r.x + r.w - head, r.y + r.h],
        [r.x + r.w - head, r.y + r.h - shaft],
        [r.x, r.y + r.h - shaft],
      ]);
    },
  },
  {
    id: 'cross',
    label: 'Cross',
    path: (r) => {
      const tx = r.w / 3;
      const ty = r.h / 3;
      return pts([
        [r.x + tx, r.y],
        [r.x + r.w - tx, r.y],
        [r.x + r.w - tx, r.y + ty],
        [r.x + r.w, r.y + ty],
        [r.x + r.w, r.y + r.h - ty],
        [r.x + r.w - tx, r.y + r.h - ty],
        [r.x + r.w - tx, r.y + r.h],
        [r.x + tx, r.y + r.h],
        [r.x + tx, r.y + r.h - ty],
        [r.x, r.y + r.h - ty],
        [r.x, r.y + ty],
        [r.x + tx, r.y + ty],
      ]);
    },
  },
  {
    id: 'process',
    label: 'Predefined process',
    path: (r) => {
      const bar = Math.min(r.w / 8, 18);
      return (
        `M ${round(r.x)} ${round(r.y)} H ${round(r.x + r.w)} V ${round(r.y + r.h)} H ${round(r.x)} Z` +
        ` M ${round(r.x + bar)} ${round(r.y)} V ${round(r.y + r.h)}` +
        ` M ${round(r.x + r.w - bar)} ${round(r.y)} V ${round(r.y + r.h)}`
      );
    },
  },
  {
    id: 'document',
    label: 'Document',
    path: (r) => {
      const wave = Math.min(r.h / 5, 24);
      return (
        `M ${round(r.x)} ${round(r.y)} H ${round(r.x + r.w)} V ${round(r.y + r.h - wave)}` +
        ` Q ${round(r.x + r.w * 0.75)} ${round(r.y + r.h)} ${round(r.x + r.w / 2)} ${round(r.y + r.h - wave / 2)}` +
        ` Q ${round(r.x + r.w * 0.25)} ${round(r.y + r.h - wave)} ${round(r.x)} ${round(r.y + r.h - wave / 2)} Z`
      );
    },
  },
];

const BY_ID = new Map(BOARD_SHAPES.map((s) => [s.id as string, s]));

/**
 * Path for a named shape, or null when the name is unknown.
 *
 * Null rather than a throw: a board written by a newer client can carry a
 * shape this one has never heard of, and drawing the plain rectangle it falls
 * back to is far better than breaking the whole board.
 */
export const boardShapePath = (
  id: string | undefined,
  r: ShapeRect
): string | null => {
  if (!id) {
    return null;
  }
  const def = BY_ID.get(id);
  return def ? def.path(r) : null;
};

export const isBoardShapeId = (id: string): id is BoardShapeId =>
  BY_ID.has(id);
