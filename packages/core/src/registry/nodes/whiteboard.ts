import { z } from 'zod/v4';

import { extractNodeRole } from '@colanode/core/lib/nodes';
import { hasNodeRole } from '@colanode/core/lib/permissions';
import { NodeModel } from '@colanode/core/registry/nodes/core';

// Native board engine (Miro / AFFiNE-edgeless style). The scene is a record
// keyed by element id so that per-element edits produce element-level Y.Map
// diffs through the existing node.update CRDT sync — concurrent edits to
// different elements (or different fields of one element) merge cleanly.

export const boardElementTypeSchema = z.enum([
  'sticky',
  'rect',
  'ellipse',
  'diamond',
  'text',
  'connector',
  'freehand',
  'frame',
  'mindmap',
  'image',
  'nodeCard',
]);

export type BoardElementType = z.infer<typeof boardElementTypeSchema>;

// Where a connector attaches to an element. Either a named side — the legacy
// form, still the convenient default — or a point normalised inside the
// element's own bounding box, so { x: 1, y: 0.37 } is 37 % down the right
// edge. The named form cannot express an arbitrary edge position, which is
// what Miro stores and what users expect when they drop an arrow on a border.
export const boardAnchorSchema = z.union([
  z.string(),
  z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
]);

export type BoardAnchor = z.infer<typeof boardAnchorSchema>;

// Named anchors expressed in the same normalised space, so the resolver has a
// single code path.
const NAMED_ANCHORS: Record<string, { x: number; y: number }> = {
  top: { x: 0.5, y: 0 },
  right: { x: 1, y: 0.5 },
  bottom: { x: 0.5, y: 1 },
  left: { x: 0, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
};

/**
 * Resolves an anchor against an element box to an absolute scene point.
 * An unknown or absent anchor falls back to the element centre, which is what
 * the canvas did before anchors existed.
 */
export const resolveBoardAnchor = (
  anchor: BoardAnchor | undefined,
  box: { x: number; y: number; w: number; h: number }
): { x: number; y: number } => {
  const unit =
    typeof anchor === 'string'
      ? (NAMED_ANCHORS[anchor] ?? NAMED_ANCHORS.center!)
      : (anchor ?? NAMED_ANCHORS.center!);

  return {
    x: box.x + box.w * unit.x,
    y: box.y + box.h * unit.y,
  };
};

/**
 * Converts an absolute scene point into a normalised anchor on an element,
 * clamped to the box. Used when the user drops a connector end on a border:
 * the exact position is kept instead of being rounded to the nearest side.
 */
export const pointToBoardAnchor = (
  point: { x: number; y: number },
  box: { x: number; y: number; w: number; h: number }
): { x: number; y: number } => {
  const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return {
    x: clamp(box.w === 0 ? 0.5 : (point.x - box.x) / box.w),
    y: clamp(box.h === 0 ? 0.5 : (point.y - box.y) / box.h),
  };
};

export const boardElementStyleSchema = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
  fontSize: z.number().optional(),
  // When true the label font auto-scales to fill the element box; when false
  // (or unset) `fontSize` is used as a fixed, user-picked size.
  fontAuto: z.boolean().optional(),
  color: z.string().optional(),
  fontWeight: z.string().optional(),
  // 'mono' renders the label in a monospace face with its spacing kept, which
  // is what makes pasted code readable. Absent = the board's normal face.
  fontFamily: z.enum(['sans', 'mono']).optional(),
  // Where the label sits in the element's box. Absent keeps the old
  // behaviour, which was centred for shapes and top-left for sticky notes.
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  opacity: z.number().optional(),
});

export type BoardElementStyle = z.infer<typeof boardElementStyleSchema>;

export const boardConnectorSchema = z.object({
  fromId: z.string().optional(),
  toId: z.string().optional(),
  fromAnchor: boardAnchorSchema.optional(),
  toAnchor: boardAnchorSchema.optional(),
  // Kept: they are what every existing connector uses, and a head type of
  // undefined falls back to reading them.
  arrowStart: z.boolean().optional(),
  arrowEnd: z.boolean().optional(),
  // Shape of each head, chosen independently. 'none' is an explicit "no head"
  // that outranks the boolean above.
  arrowStartType: z
    .enum(['none', 'arrow', 'triangle', 'circle', 'diamond'])
    .optional(),
  arrowEndType: z
    .enum(['none', 'arrow', 'triangle', 'circle', 'diamond'])
    .optional(),
  label: z.string().optional(),
  // Line shape: straight segment (default), an orthogonal rounded elbow, or a
  // quadratic curve. Optional + backward-compatible — absent reads as
  // 'straight'.
  routing: z.enum(['straight', 'elbow', 'curved']).optional(),
  // A single reshape waypoint in SCENE coordinates: the elbow corner / curve
  // control point the user dragged. Absent = auto-routed.
  bend: z.object({ x: z.number(), y: z.number() }).optional(),
  // Multiple reshape waypoints in SCENE coordinates. When present these
  // supersede the legacy single `bend`. Absent = auto-routed / legacy.
  bends: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  // Hop over the lines this one crosses instead of drawing an ambiguous X.
  // Opt-in: a board of parallel lines does not want hops everywhere.
  jumps: z.boolean().optional(),
  // What the line MEANS. Absent = a plain connector, which is what every
  // existing line is.
  kind: z.enum(['blocks', 'dependsOn', 'relatesTo']).optional(),
});

export const boardDependencyKind = boardConnectorSchema.shape.kind;

export type BoardConnector = z.infer<typeof boardConnectorSchema>;

export const boardMindmapSchema = z.object({
  parentId: z.string().optional(),
  collapsed: z.boolean().optional(),
  // Which way the tree grows away from its root. Read off the ROOT only — a
  // child pointing elsewhere would tear the layout in half. Absent = 'right',
  // which is how every existing map was laid out.
  direction: z.enum(['right', 'left', 'down', 'up']).optional(),
});

export type BoardMindmap = z.infer<typeof boardMindmapSchema>;

export const boardElementSchema = z.object({
  id: z.string(),
  type: boardElementTypeSchema,
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().optional(),
  // fractional-index string used for stable z ordering; lexicographic sort
  // of these strings yields paint order (back to front).
  z: z.string(),
  style: boardElementStyleSchema,
  text: z.string().optional(),
  points: z.array(z.array(z.number())).optional(),
  // Named outline drawn over the element's box — 'hexagon', 'cylinder' and so
  // on. A plain string, NOT an enum: a board written by a newer client can
  // carry a shape this one has never heard of, and rejecting the element
  // outright would lose it. An unknown name simply falls back to the base
  // rectangle. Absent = the element's own default outline.
  shape: z.string().optional(),
  // Taken out of the way without being deleted. Still listed in the layers
  // panel — invisible and forgotten are different things.
  hidden: z.boolean().optional(),
  // A short chip in the element's corner: a story point, an estimate, a
  // reference. Free text rather than a number — "3", "XL" and "REQ-14" are
  // the same feature, and a field that only takes digits sends people back to
  // stacking a second sticky on top.
  badge: z.string().optional(),
  // User id of whoever made this while private mode was on. Other clients
  // drop it on arrival instead of drawing it, until it is revealed.
  // This hides the element; it does not withhold it — the data still travels.
  privateBy: z.string().optional(),
  connector: boardConnectorSchema.optional(),
  // Colanode file-node id backing an `image` element (the uploaded picture).
  // Optional + absent on non-image elements and legacy boards.
  fileId: z.string().optional(),
  // Colanode node id a `nodeCard` element references (the page / folder /
  // etc. shown as a card). Optional + absent on non-card elements and on
  // legacy boards, so it is fully backward-compatible.
  nodeId: z.string().optional(),
  frameId: z.string().optional(),
  // Elements sharing a groupId select and move as one unit (Miro-style).
  groupId: z.string().optional(),
  mindmap: boardMindmapSchema.optional(),
  // Hard lock (multi-user): when `locked` is true the element cannot be
  // moved / resized / rotated / text-edited by anyone except `lockedBy`
  // (any editor may still unlock it). Optional + absent on legacy boards, so
  // pre-lock scenes simply read as unlocked.
  locked: z.boolean().optional(),
  lockedBy: z.string().optional(),
});

export type BoardElement = z.infer<typeof boardElementSchema>;

export const boardSceneSchema = z.record(z.string(), boardElementSchema);

export type BoardScene = z.infer<typeof boardSceneSchema>;

export const whiteboardAttributesSchema = z.object({
  type: z.literal('whiteboard'),
  name: z.string(),
  avatar: z.string().nullable().optional(),
  parentId: z.string(),
  index: z.string().nullable().optional(),
  // Board scene: { [elementId]: BoardElement }. Stored as a record so the CRDT
  // layer merges edits at element granularity (near-real-time collaboration).
  scene: boardSceneSchema.optional(),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z.string().nullable().optional(),
});

export type WhiteboardAttributes = z.infer<typeof whiteboardAttributesSchema>;

const extractSceneTexts = (scene: unknown): string[] => {
  if (!scene || typeof scene !== 'object') {
    return [];
  }

  const texts: string[] = [];
  for (const element of Object.values(scene as Record<string, unknown>)) {
    if (!element || typeof element !== 'object') {
      continue;
    }

    const { text, connector } = element as {
      text?: unknown;
      connector?: { label?: unknown } | null;
    };

    if (typeof text === 'string' && text.trim().length > 0) {
      texts.push(text.trim());
    }

    const label = connector?.label;
    if (typeof label === 'string' && label.trim().length > 0) {
      texts.push(label.trim());
    }
  }

  return texts;
};

export const whiteboardModel: NodeModel = {
  type: 'whiteboard',
  attributesSchema: whiteboardAttributesSchema,
  canCreate: (context) => {
    if (context.tree.length === 0) {
      return false;
    }

    const role = extractNodeRole(context.tree, context.user.id);
    if (!role) {
      return false;
    }

    return hasNodeRole(role, 'editor');
  },
  canUpdateAttributes: (context) => {
    if (context.tree.length === 0) {
      return false;
    }

    const role = extractNodeRole(context.tree, context.user.id);
    if (!role) {
      return false;
    }

    return hasNodeRole(role, 'editor');
  },
  canUpdateDocument: (context) => {
    if (context.tree.length === 0) {
      return false;
    }

    const role = extractNodeRole(context.tree, context.user.id);
    if (!role) {
      return false;
    }

    return hasNodeRole(role, 'editor');
  },
  canDelete: (context) => {
    if (context.tree.length === 0) {
      return false;
    }

    const role = extractNodeRole(context.tree, context.user.id);
    if (!role) {
      return false;
    }

    return hasNodeRole(role, 'admin');
  },
  canReact: () => {
    return false;
  },
  extractText: (id, attributes) => {
    if (attributes.type !== 'whiteboard') {
      throw new Error('Invalid node type');
    }

    const texts = extractSceneTexts(attributes.scene);

    return {
      name: attributes.name,
      attributes: texts.length > 0 ? texts.join('\n') : null,
    };
  },
  extractMentions: () => {
    return [];
  },
};
