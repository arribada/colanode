import { z } from 'zod/v4';

import { extractNodeRole } from '@colanode/core/lib/nodes';
import { hasNodeRole } from '@colanode/core/lib/permissions';
import { NodeModel } from '@colanode/core/registry/nodes/core';

export const whiteboardAttributesSchema = z.object({
  type: z.literal('whiteboard'),
  name: z.string(),
  avatar: z.string().nullable().optional(),
  parentId: z.string(),
  // Excalidraw scene JSON: { elements, appState, files }. Stored as an opaque
  // blob and replaced wholesale on each save (last-writer-wins).
  scene: z.any().optional(),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z.string().nullable().optional(),
});

export type WhiteboardAttributes = z.infer<typeof whiteboardAttributesSchema>;

type WhiteboardSceneElement = {
  text?: unknown;
  isDeleted?: unknown;
};

const extractSceneTexts = (scene: unknown): string[] => {
  if (!scene || typeof scene !== 'object') {
    return [];
  }

  const elements = (scene as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) {
    return [];
  }

  const texts: string[] = [];
  for (const element of elements) {
    if (!element || typeof element !== 'object') {
      continue;
    }

    const { text, isDeleted } = element as WhiteboardSceneElement;
    if (isDeleted === true) {
      continue;
    }

    if (typeof text === 'string' && text.trim().length > 0) {
      texts.push(text.trim());
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
