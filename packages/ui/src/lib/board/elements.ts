// Board element factories, palette, z-order and connector resolution. Bridges
// the pure geometry / fractional-index helpers with the core BoardElement type.

import {
  BoardElement,
  BoardElementStyle,
  BoardElementType,
  BoardScene,
} from '@colanode/core';
import {
  generateKeyBetween,
  keyAfterAll,
  keyBeforeAll,
} from '@colanode/ui/lib/board/fractional-index';
import {
  Anchor,
  anchorPoint,
  nearestAnchor,
  Point,
  Rect,
} from '@colanode/ui/lib/board/geometry';

export const STICKY_COLORS = [
  '#fff7ae',
  '#ffd6e7',
  '#cfe8ff',
  '#d5f5e3',
  '#e9d8fd',
  '#ffe0b2',
  '#e5e7eb',
];

export const SHAPE_FILLS = [
  '#ffffff',
  '#dbeafe',
  '#dcfce7',
  '#fef9c3',
  '#fee2e2',
  '#f3e8ff',
  '#e2e8f0',
];

export const STROKE_COLORS = [
  '#0f172a',
  '#334155',
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#9333ea',
  '#ea580c',
];

export const DEFAULT_STROKE = '#334155';
export const DEFAULT_TEXT_COLOR = '#1f2937';

interface ElementDefault {
  w: number;
  h: number;
  style: BoardElementStyle;
  text?: string;
}

const ELEMENT_DEFAULTS: Record<BoardElementType, ElementDefault> = {
  sticky: {
    w: 180,
    h: 140,
    style: {
      fill: STICKY_COLORS[0],
      color: DEFAULT_TEXT_COLOR,
      fontSize: 16,
    },
  },
  rect: {
    w: 160,
    h: 100,
    style: {
      fill: '#ffffff',
      stroke: DEFAULT_STROKE,
      strokeWidth: 2,
      color: DEFAULT_TEXT_COLOR,
      fontSize: 15,
    },
  },
  ellipse: {
    w: 150,
    h: 120,
    style: {
      fill: '#ffffff',
      stroke: DEFAULT_STROKE,
      strokeWidth: 2,
      color: DEFAULT_TEXT_COLOR,
      fontSize: 15,
    },
  },
  diamond: {
    w: 150,
    h: 120,
    style: {
      fill: '#ffffff',
      stroke: DEFAULT_STROKE,
      strokeWidth: 2,
      color: DEFAULT_TEXT_COLOR,
      fontSize: 15,
    },
  },
  text: {
    w: 200,
    h: 40,
    style: { color: DEFAULT_TEXT_COLOR, fontSize: 20 },
  },
  connector: {
    w: 0,
    h: 0,
    style: { stroke: DEFAULT_STROKE, strokeWidth: 2 },
  },
  freehand: {
    w: 0,
    h: 0,
    style: { stroke: DEFAULT_STROKE, strokeWidth: 3 },
  },
  frame: {
    w: 480,
    h: 320,
    style: { fill: 'transparent', stroke: '#94a3b8', strokeWidth: 2 },
    text: 'Frame',
  },
  mindmap: {
    w: 170,
    h: 52,
    style: {
      fill: '#eef2ff',
      stroke: '#6366f1',
      strokeWidth: 2,
      color: '#1e1b4b',
      fontSize: 15,
    },
  },
  image: {
    w: 240,
    h: 180,
    style: {},
  },
};

export const defaultForType = (type: BoardElementType): ElementDefault =>
  ELEMENT_DEFAULTS[type];

let idCounter = 0;
export const createElementId = (): string => {
  idCounter = (idCounter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `el${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
};

export interface CreateElementInput {
  type: BoardElementType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  z: string;
  style?: Partial<BoardElementStyle>;
  text?: string;
  points?: number[][];
  frameId?: string;
  fileId?: string;
}

export const createElement = (input: CreateElementInput): BoardElement => {
  const def = ELEMENT_DEFAULTS[input.type];
  return {
    id: createElementId(),
    type: input.type,
    x: input.x,
    y: input.y,
    w: input.w ?? def.w,
    h: input.h ?? def.h,
    z: input.z,
    style: { ...def.style, ...input.style },
    ...(input.text !== undefined || def.text !== undefined
      ? { text: input.text ?? def.text }
      : {}),
    ...(input.points ? { points: input.points } : {}),
    ...(input.frameId ? { frameId: input.frameId } : {}),
    ...(input.fileId ? { fileId: input.fileId } : {}),
  };
};

export const elementRect = (el: BoardElement): Rect => ({
  x: el.x,
  y: el.y,
  w: el.w,
  h: el.h,
});

/** Elements sorted back-to-front by their fractional z key. */
export const sortedElements = (scene: BoardScene): BoardElement[] =>
  Object.values(scene).sort((a, b) =>
    a.z < b.z ? -1 : a.z > b.z ? 1 : 0
  );

export const zKeys = (scene: BoardScene): string[] =>
  Object.values(scene).map((el) => el.z);

/** A z key that paints on top of everything currently in the scene. */
export const topZ = (scene: BoardScene): string => keyAfterAll(zKeys(scene));

/** A z key that paints below everything currently in the scene. */
export const bottomZ = (scene: BoardScene): string =>
  keyBeforeAll(zKeys(scene));

export const zBetween = (a: string | null, b: string | null): string =>
  generateKeyBetween(a, b);

/** Resolve a connector's endpoints in scene coordinates. */
export const resolveConnectorEndpoints = (
  el: BoardElement,
  scene: BoardScene
): { start: Point; end: Point } => {
  const c = el.connector ?? {};
  const pts = el.points ?? [
    [el.x, el.y],
    [el.x + (el.w || 100), el.y + (el.h || 0)],
  ];
  let start: Point = { x: pts[0]?.[0] ?? el.x, y: pts[0]?.[1] ?? el.y };
  let end: Point = {
    x: pts[1]?.[0] ?? el.x + 100,
    y: pts[1]?.[1] ?? el.y,
  };

  const fromEl = c.fromId ? scene[c.fromId] : undefined;
  const toEl = c.toId ? scene[c.toId] : undefined;

  if (toEl) {
    const rect = elementRect(toEl);
    const anchor = (c.toAnchor as Anchor | undefined) ?? nearestAnchor(rect, start);
    end = anchorPoint(rect, anchor);
  }
  if (fromEl) {
    const rect = elementRect(fromEl);
    const anchor =
      (c.fromAnchor as Anchor | undefined) ?? nearestAnchor(rect, end);
    start = anchorPoint(rect, anchor);
  }
  if (toEl && !c.toAnchor) {
    const rect = elementRect(toEl);
    end = anchorPoint(rect, nearestAnchor(rect, start));
  }

  return { start, end };
};

/** Ids of elements that belong to a frame (explicit frameId or contained). */
export const frameChildIds = (
  scene: BoardScene,
  frameId: string
): string[] => {
  const frame = scene[frameId];
  if (!frame) {
    return [];
  }
  const fRect = elementRect(frame);
  const ids: string[] = [];
  for (const el of Object.values(scene)) {
    if (el.id === frameId || el.type === 'frame') {
      continue;
    }
    if (el.frameId === frameId) {
      ids.push(el.id);
      continue;
    }
    // geometric containment for elements without an explicit frame binding
    if (
      !el.frameId &&
      el.x >= fRect.x &&
      el.y >= fRect.y &&
      el.x + el.w <= fRect.x + fRect.w &&
      el.y + el.h <= fRect.y + fRect.h
    ) {
      ids.push(el.id);
    }
  }
  return ids;
};
