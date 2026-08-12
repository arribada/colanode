// Converts a Miro REST export (items + connectors) into a board scene.
// Pure — no React, no network — so the mapping is unit-testable and the same
// code serves the in-app import and any offline conversion script.

import { BoardElement, BoardScene } from '@colanode/core';
import { createElement, STICKY_COLORS } from '@colanode/ui/lib/board/elements';
import { generateNKeysBetween } from '@colanode/ui/lib/board/fractional-index';

export interface MiroItem {
  id: string;
  type: string;
  data?: {
    content?: string;
    shape?: string;
    title?: string;
  };
  style?: Record<string, string>;
  geometry?: { width?: number; height?: number; rotation?: number };
  position?: { x?: number; y?: number };
  parent?: { id?: string };
}

export interface MiroConnector {
  id: string;
  startItem?: { id?: string };
  endItem?: { id?: string };
  shape?: string;
  style?: Record<string, string>;
  captions?: { content?: string }[];
}

export interface MiroImportReport {
  /** How many board elements were produced, by board type. */
  created: Record<string, number>;
  /** Miro item types that were dropped, and how many of each. */
  skipped: Record<string, number>;
  /** Connectors dropped because an endpoint was outside the import. */
  danglingConnectors: number;
}

export interface MiroImportResult {
  scene: BoardScene;
  report: MiroImportReport;
}

/**
 * Miro serves rich text; the board stores plain text.
 *
 * `<br>` and the end of a block become newlines rather than disappearing —
 * a sticky note listing four bullet points must not collapse into one line.
 */
export const miroTextToPlain = (html: string | undefined): string => {
  if (!html) {
    return '';
  }
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// Miro's named sticky palette, matched to the nearest note colour the board
// already offers. Unknown names fall back to the first (yellow), which is what
// Miro itself defaults to.
const STICKY_BY_NAME: Record<string, string> = {
  gray: '#e5e7eb',
  light_yellow: '#fff7ae',
  yellow: '#fff7ae',
  orange: '#ffe0b2',
  light_green: '#d5f5e3',
  green: '#d5f5e3',
  dark_green: '#d5f5e3',
  cyan: '#cfe8ff',
  light_pink: '#ffd6e7',
  pink: '#ffd6e7',
  violet: '#e9d8fd',
  red: '#ffd6e7',
  light_blue: '#cfe8ff',
  blue: '#cfe8ff',
  dark_blue: '#cfe8ff',
  black: '#e5e7eb',
};

const stickyFill = (name: string | undefined): string =>
  (name && STICKY_BY_NAME[name]) || STICKY_COLORS[0]!;

// Miro has a large shape catalogue; the board has three. Anything that is not
// clearly a circle or a rhombus reads better as a rectangle than as the wrong
// shape, so that is the fallback.
const SHAPE_MAP: Record<string, 'rect' | 'ellipse' | 'diamond'> = {
  rectangle: 'rect',
  round_rectangle: 'rect',
  square: 'rect',
  circle: 'ellipse',
  oval: 'ellipse',
  ellipse: 'ellipse',
  rhombus: 'diamond',
  diamond: 'diamond',
};

const ROUTING_MAP: Record<string, 'straight' | 'elbow' | 'curved'> = {
  straight: 'straight',
  elbowed: 'elbow',
  curved: 'curved',
};

const hasArrow = (cap: string | undefined): boolean =>
  !!cap && cap !== 'none';

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * Miro positions an item by its CENTRE; the board positions by its top-left.
 * Getting this wrong shifts everything by half its own size, which looks like
 * a slightly scrambled board rather than an obvious failure — so it is done
 * once, here.
 */
const topLeft = (item: MiroItem): { x: number; y: number; w: number; h: number } => {
  const w = num(item.geometry?.width, 160);
  const h = num(item.geometry?.height, 60);
  const cx = num(item.position?.x, 0);
  const cy = num(item.position?.y, 0);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
};

const bump = (report: MiroImportReport['created'], key: string) => {
  report[key] = (report[key] ?? 0) + 1;
};

export interface MiroExport {
  items: MiroItem[];
  connectors: MiroConnector[];
  /** Frame names found in a per-frame dump, in file order. */
  frames: string[];
}

const isItemArray = (v: unknown): v is MiroItem[] =>
  Array.isArray(v) && v.every((x) => !!x && typeof x === 'object');

// A connector is the only export row with start/end items, which is what
// separates the two lists when they arrive mixed or unlabelled.
const looksLikeConnector = (v: Record<string, unknown>): boolean =>
  'startItem' in v || 'endItem' in v;

/**
 * Normalise whatever a Miro dump happens to look like into one shape.
 *
 * Accepted:
 *   - a bare array of items (optionally with connectors mixed in)
 *   - { items, connectors } from a two-call dump
 *   - { data: [...] }, which is what one REST call returns
 *   - { "<frame name>": [items…] }, a per-frame dump
 *
 * Throws with a readable message rather than returning an empty board: an
 * import that silently does nothing is the worst outcome here.
 */
export const parseMiroExport = (text: string): MiroExport => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  const out: MiroExport = { items: [], connectors: [], frames: [] };

  const absorb = (rows: MiroItem[]) => {
    for (const row of rows) {
      const rec = row as unknown as Record<string, unknown>;
      if (looksLikeConnector(rec) || rec.type === 'connector') {
        out.connectors.push(row as unknown as MiroConnector);
      } else if (typeof rec.type === 'string') {
        out.items.push(row);
      }
    }
  };

  if (isItemArray(parsed)) {
    absorb(parsed);
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (isItemArray(obj.items)) {
      absorb(obj.items);
    }
    if (isItemArray(obj.connectors)) {
      out.connectors.push(...(obj.connectors as unknown as MiroConnector[]));
    }
    if (isItemArray(obj.data)) {
      absorb(obj.data as MiroItem[]);
    }
    if (out.items.length === 0 && out.connectors.length === 0) {
      // per-frame dump: every value is a list of items
      for (const [name, value] of Object.entries(obj)) {
        if (isItemArray(value)) {
          out.frames.push(name);
          absorb(value);
        }
      }
    }
  }

  if (out.items.length === 0 && out.connectors.length === 0) {
    throw new Error(
      'No Miro items found. Expected a list of items, or { items, connectors }.'
    );
  }
  return out;
};

/**
 * Build a board scene from a Miro export.
 *
 * `offset` shifts the whole import, so it can be dropped next to existing
 * content rather than on top of it.
 */
export const convertMiroBoard = (
  items: MiroItem[],
  connectors: MiroConnector[] = [],
  offset: { x: number; y: number } = { x: 0, y: 0 }
): MiroImportResult => {
  const report: MiroImportReport = {
    created: {},
    skipped: {},
    danglingConnectors: 0,
  };

  // Frames first so the elements landing inside them paint on top, and so a
  // child's frameId can point at an element that already exists.
  const ordered = [...items].sort((a, b) => {
    const af = a.type === 'frame' ? 0 : 1;
    const bf = b.type === 'frame' ? 0 : 1;
    return af - bf;
  });

  const zKeys = generateNKeysBetween(
    null,
    null,
    ordered.length + connectors.length
  );
  let zi = 0;

  const scene: BoardScene = {};
  // Miro id -> board id, so connectors and frame membership can be rewired.
  const idMap: Record<string, string> = {};

  for (const item of ordered) {
    const box = topLeft(item);
    const x = box.x + offset.x;
    const y = box.y + offset.y;
    const z = zKeys[zi++]!;
    let el: BoardElement | null = null;

    switch (item.type) {
      case 'frame': {
        el = createElement({
          type: 'frame',
          x,
          y,
          w: box.w,
          h: box.h,
          z,
          text: item.data?.title ?? miroTextToPlain(item.data?.content),
        });
        break;
      }
      case 'sticky_note': {
        el = createElement({
          type: 'sticky',
          x,
          y,
          w: box.w,
          h: box.h,
          z,
          style: { fill: stickyFill(item.style?.fillColor) },
          text: miroTextToPlain(item.data?.content),
        });
        break;
      }
      case 'text': {
        el = createElement({
          type: 'text',
          x,
          y,
          w: box.w,
          // Miro omits the height of a text item; the board needs one.
          h: num(item.geometry?.height, 32),
          z,
          style: { stroke: item.style?.color ?? '#1a1a1a' },
          text: miroTextToPlain(item.data?.content),
        });
        break;
      }
      case 'shape': {
        const type = SHAPE_MAP[item.data?.shape ?? ''] ?? 'rect';
        el = createElement({
          type,
          x,
          y,
          w: box.w,
          h: box.h,
          z,
          style: {
            // A Miro fill can be a hex or the word "transparent"; both are
            // valid here, so it passes through untouched.
            fill: item.style?.fillColor ?? '#ffffff',
            stroke: item.style?.borderColor ?? '#334155',
            strokeWidth: Number(item.style?.borderWidth ?? 2) || 2,
          },
          text: miroTextToPlain(item.data?.content),
        });
        break;
      }
      case 'divider': {
        // A rule, not a link: kept as a plain two-point line so the layout
        // still reads, but with no endpoints to attach to.
        const rotated = num(item.geometry?.rotation, 0) % 180 !== 0;
        el = createElement({
          type: 'connector',
          x,
          y,
          w: box.w,
          h: box.h,
          z,
          style: { stroke: '#94a3b8', strokeWidth: 1 },
          points: rotated
            ? [
                [x + box.w / 2, y],
                [x + box.w / 2, y + box.w],
              ]
            : [
                [x, y + box.h / 2],
                [x + box.w, y + box.h / 2],
              ],
        });
        el.connector = { arrowEnd: false };
        break;
      }
      default: {
        // image, table, embed, card, app_card, document…: these need a file
        // upload or a data model the board has no equivalent for. Counted, so
        // the import can say what it left behind instead of silently dropping
        // a third of the board.
        report.skipped[item.type] = (report.skipped[item.type] ?? 0) + 1;
        continue;
      }
    }

    const rotation = num(item.geometry?.rotation, 0);
    if (rotation && el.type !== 'connector') {
      el.rotation = rotation;
    }
    const parentId = item.parent?.id;
    if (parentId && idMap[parentId]) {
      el.frameId = idMap[parentId];
    }
    idMap[item.id] = el.id;
    scene[el.id] = el;
    bump(report.created, el.type);
  }

  for (const c of connectors) {
    const fromId = c.startItem?.id ? idMap[c.startItem.id] : undefined;
    const toId = c.endItem?.id ? idMap[c.endItem.id] : undefined;
    if (!fromId || !toId) {
      // An endpoint outside the imported set would leave an arrow pointing at
      // nothing; dropping it is better than drawing it into empty space.
      report.danglingConnectors++;
      continue;
    }
    const from = scene[fromId]!;
    const to = scene[toId]!;
    const el = createElement({
      type: 'connector',
      x: 0,
      y: 0,
      z: zKeys[zi++] ?? generateNKeysBetween(null, null, 1)[0]!,
      style: {
        stroke: c.style?.strokeColor ?? '#334155',
        strokeWidth: Number(c.style?.strokeWidth ?? 2) || 2,
      },
      points: [
        [from.x + from.w / 2, from.y + from.h / 2],
        [to.x + to.w / 2, to.y + to.h / 2],
      ],
    });
    el.connector = {
      fromId,
      toId,
      routing: ROUTING_MAP[c.shape ?? ''] ?? 'elbow',
      arrowStart: hasArrow(c.style?.startStrokeCap),
      arrowEnd: hasArrow(c.style?.endStrokeCap),
      label: c.captions?.[0]?.content
        ? miroTextToPlain(c.captions[0].content)
        : undefined,
    };
    scene[el.id] = el;
    bump(report.created, 'connector');
  }

  return { scene, report };
};
