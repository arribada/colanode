import { z } from 'zod/v4';

import {
  extractNodeRole,
  haveNodeCollaboratorsChanged,
} from '@colanode/core/lib/nodes';
import { hasNodeRole } from '@colanode/core/lib/permissions';
import { NodeModel, nodeRoleEnum } from '@colanode/core/registry/nodes/core';
import { boardSceneSchema } from '@colanode/core/registry/nodes/whiteboard';

export const folderAttributesSchema = z.object({
  type: z.literal('folder'),
  name: z.string(),
  avatar: z.string().nullable().optional(),
  parentId: z.string(),
  index: z.string().nullable().optional(),
  // Optional board scene — lets a folder open as an editable whiteboard view
  // (AFFiNE-style Document<->Board). Same shape as whiteboard `scene`; absent
  // on legacy folders, so backward-compatible.
  boardScene: boardSceneSchema.optional(),
  collaborators: z.record(z.string(), nodeRoleEnum).optional(),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z.string().nullable().optional(),
});

export type FolderAttributes = z.infer<typeof folderAttributesSchema>;

export const folderModel: NodeModel = {
  type: 'folder',
  attributesSchema: folderAttributesSchema,
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

    if (haveNodeCollaboratorsChanged(context.node, context.attributes)) {
      return hasNodeRole(role, 'admin');
    }

    return hasNodeRole(role, 'editor');
  },
  canUpdateDocument: () => {
    return false;
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
  extractText: (_, attributes) => {
    if (attributes.type !== 'folder') {
      throw new Error('Invalid node type');
    }

    return {
      name: attributes.name,
      attributes: null,
    };
  },
  extractMentions: () => {
    return [];
  },
};
