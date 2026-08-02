import { z } from 'zod/v4';

import { extractBlocksMentions } from '@colanode/core/lib/mentions';
import {
  extractNodeRole,
  haveNodeCollaboratorsChanged,
} from '@colanode/core/lib/nodes';
import { hasNodeRole } from '@colanode/core/lib/permissions';
import { richTextContentSchema } from '@colanode/core/registry/documents/rich-text';
import {
  NodeModel,
  nodeCoverSchema,
  nodeRoleEnum,
} from '@colanode/core/registry/nodes/core';

export const pageAttributesSchema = z.object({
  type: z.literal('page'),
  name: z.string(),
  avatar: z.string().nullable().optional(),
  cover: nodeCoverSchema.nullable().optional(),
  parentId: z.string(),
  index: z.string().nullable().optional(),
  // Page templates live under the page's space (parentId is set to the
  // space id when a template is saved) and are kept out of the browsing
  // collection (see notTemplateSql) — surfaced only through the dedicated
  // page.template.list query / "New from template" menu on the space.
  isTemplate: z.boolean().nullable().optional(),
  collaborators: z.record(z.string(), nodeRoleEnum).optional(),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z.string().nullable().optional(),
});

export type PageAttributes = z.infer<typeof pageAttributesSchema>;

export const pageModel: NodeModel = {
  type: 'page',
  attributesSchema: pageAttributesSchema,
  documentSchema: richTextContentSchema,
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
    if (attributes.type !== 'page') {
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
  extractDocumentMentions: (id, content) => {
    return extractBlocksMentions(id, content.blocks);
  },
};
