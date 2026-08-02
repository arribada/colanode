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
]);

export type BoardElementType = z.infer<typeof boardElementTypeSchema>;

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
  opacity: z.number().optional(),
});

export type BoardElementStyle = z.infer<typeof boardElementStyleSchema>;

export const boardConnectorSchema = z.object({
  fromId: z.string().optional(),
  toId: z.string().optional(),
  fromAnchor: z.string().optional(),
  toAnchor: z.string().optional(),
  arrowStart: z.boolean().optional(),
  arrowEnd: z.boolean().optional(),
  label: z.string().optional(),
});

export type BoardConnector = z.infer<typeof boardConnectorSchema>;

export const boardMindmapSchema = z.object({
  parentId: z.string().optional(),
  collapsed: z.boolean().optional(),
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
  connector: boardConnectorSchema.optional(),
  frameId: z.string().optional(),
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
