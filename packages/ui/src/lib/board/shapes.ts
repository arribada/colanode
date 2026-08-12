// The extra shape catalogue: everything past rectangle / ellipse / diamond,
// including the UI prototyping pieces (browser, phone, field, card…).
// A composite piece earns its place by being one element instead of four
// that then have to be kept aligned.
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
  | 'document'
  | 'browser'
  | 'phone'
  | 'field'
  | 'card'
  | 'checkbox'
  | 'toggle'
  | 'dropdown'
  | 'avatar';

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
  {
    id: 'browser',
    label: 'Browser window',
    path: (r) => {
      const bar = Math.min(r.h / 5, 34);
      const dot = Math.min(bar / 4, 5);
      const cy = r.y + bar / 2;
      let d =
        `M ${round(r.x)} ${round(r.y)} H ${round(r.x + r.w)}` +
        ` V ${round(r.y + r.h)} H ${round(r.x)} Z` +
        ` M ${round(r.x)} ${round(r.y + bar)} H ${round(r.x + r.w)}`;
      // Three dots, drawn as arcs so the whole thing stays one path.
      for (let i = 0; i < 3; i++) {
        const cx = r.x + bar * 0.5 + i * dot * 3;
        d +=
          ` M ${round(cx - dot)} ${round(cy)}` +
          ` a ${round(dot)} ${round(dot)} 0 1 0 ${round(dot * 2)} 0` +
          ` a ${round(dot)} ${round(dot)} 0 1 0 ${round(-dot * 2)} 0`;
      }
      return d;
    },
  },
  {
    id: 'phone',
    label: 'Phone frame',
    path: (r) => {
      const rad = Math.min(r.w, r.h) / 8;
      const notch = Math.min(r.w / 3, 60);
      return (
        `M ${round(r.x + rad)} ${round(r.y)} H ${round(r.x + r.w - rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + r.w)} ${round(r.y + rad)}` +
        ` V ${round(r.y + r.h - rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + r.w - rad)} ${round(r.y + r.h)}` +
        ` H ${round(r.x + rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x)} ${round(r.y + r.h - rad)}` +
        ` V ${round(r.y + rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + rad)} ${round(r.y)} Z` +
        // the notch
        ` M ${round(r.x + r.w / 2 - notch / 2)} ${round(r.y)}` +
        ` h ${round(notch)} v ${round(Math.min(r.h / 20, 10))}` +
        ` h ${round(-notch)} Z`
      );
    },
  },
  {
    id: 'field',
    label: 'Input field',
    path: (r) => {
      const rad = Math.min(6, r.h / 4);
      const pad = Math.min(r.w / 10, 14);
      const mid = r.y + r.h / 2;
      return (
        `M ${round(r.x + rad)} ${round(r.y)} H ${round(r.x + r.w - rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + r.w)} ${round(r.y + rad)}` +
        ` V ${round(r.y + r.h - rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + r.w - rad)} ${round(r.y + r.h)}` +
        ` H ${round(r.x + rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x)} ${round(r.y + r.h - rad)}` +
        ` V ${round(r.y + rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + rad)} ${round(r.y)} Z` +
        // the placeholder line
        ` M ${round(r.x + pad)} ${round(mid)} H ${round(r.x + r.w * 0.45)}`
      );
    },
  },
  {
    id: 'card',
    label: 'Card',
    path: (r) => {
      const img = r.y + r.h * 0.55;
      const pad = Math.min(r.w / 12, 16);
      const line = (y: number, w: number) =>
        ` M ${round(r.x + pad)} ${round(y)} H ${round(r.x + pad + w)}`;
      return (
        `M ${round(r.x)} ${round(r.y)} H ${round(r.x + r.w)}` +
        ` V ${round(r.y + r.h)} H ${round(r.x)} Z` +
        ` M ${round(r.x)} ${round(img)} H ${round(r.x + r.w)}` +
        line(img + (r.h - (img - r.y)) * 0.3, (r.w - pad * 2) * 0.8) +
        line(img + (r.h - (img - r.y)) * 0.55, r.w - pad * 2)
      );
    },
  },
  {
    id: 'checkbox',
    label: 'Checkbox',
    path: (r) => {
      const side = Math.min(r.w, r.h);
      const x = r.x;
      const y = r.y + (r.h - side) / 2;
      return (
        `M ${round(x)} ${round(y)} h ${round(side)} v ${round(side)}` +
        ` h ${round(-side)} Z` +
        // the tick
        ` M ${round(x + side * 0.22)} ${round(y + side * 0.52)}` +
        ` L ${round(x + side * 0.42)} ${round(y + side * 0.72)}` +
        ` L ${round(x + side * 0.78)} ${round(y + side * 0.28)}`
      );
    },
  },
  {
    id: 'toggle',
    label: 'Toggle',
    path: (r) => {
      const h = Math.min(r.h, r.w / 2);
      const y = r.y + (r.h - h) / 2;
      const rad = h / 2;
      const w = Math.min(r.w, h * 2);
      return (
        `M ${round(r.x + rad)} ${round(y)} H ${round(r.x + w - rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + w - rad)} ${round(y + h)}` +
        ` H ${round(r.x + rad)}` +
        ` A ${round(rad)} ${round(rad)} 0 0 1 ${round(r.x + rad)} ${round(y)} Z` +
        // the knob, sitting to the right: a toggle drawn off reads as a pill
        ` M ${round(r.x + w - rad - rad * 0.6)} ${round(y + h / 2)}` +
        ` a ${round(rad * 0.6)} ${round(rad * 0.6)} 0 1 0 ${round(rad * 1.2)} 0` +
        ` a ${round(rad * 0.6)} ${round(rad * 0.6)} 0 1 0 ${round(-rad * 1.2)} 0`
      );
    },
  },
  {
    id: 'dropdown',
    label: 'Dropdown',
    path: (r) => {
      const pad = Math.min(r.w / 10, 14);
      const mid = r.y + r.h / 2;
      const car = Math.min(r.h / 4, 8);
      return (
        `M ${round(r.x)} ${round(r.y)} H ${round(r.x + r.w)}` +
        ` V ${round(r.y + r.h)} H ${round(r.x)} Z` +
        ` M ${round(r.x + pad)} ${round(mid)} H ${round(r.x + r.w * 0.5)}` +
        // the caret
        ` M ${round(r.x + r.w - pad - car)} ${round(mid - car / 2)}` +
        ` L ${round(r.x + r.w - pad - car / 2)} ${round(mid + car / 2)}` +
        ` L ${round(r.x + r.w - pad)} ${round(mid - car / 2)}`
      );
    },
  },
  {
    id: 'avatar',
    label: 'Avatar',
    path: (r) => {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const rad = Math.min(r.w, r.h) / 2;
      const head = rad * 0.34;
      return (
        `M ${round(cx - rad)} ${round(cy)}` +
        ` a ${round(rad)} ${round(rad)} 0 1 0 ${round(rad * 2)} 0` +
        ` a ${round(rad)} ${round(rad)} 0 1 0 ${round(-rad * 2)} 0 Z` +
        // head
        ` M ${round(cx - head)} ${round(cy - rad * 0.22)}` +
        ` a ${round(head)} ${round(head)} 0 1 0 ${round(head * 2)} 0` +
        ` a ${round(head)} ${round(head)} 0 1 0 ${round(-head * 2)} 0` +
        // Shoulders, kept clear of the bottom: at 0.62 down with a 0.5
        // radius the arc swung 7px OUTSIDE the element box.
        ` M ${round(cx - rad * 0.5)} ${round(cy + rad * 0.45)}` +
        ` a ${round(rad * 0.5)} ${round(rad * 0.3)} 0 0 1 ${round(rad)} 0`
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
