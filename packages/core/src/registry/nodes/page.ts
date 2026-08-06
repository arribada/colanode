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
import { boardSceneSchema } from '@colanode/core/registry/nodes/whiteboard';

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
  // Optional board scene — lets a page open as an editable whiteboard view
  // (AFFiNE-style Document<->Board). Same shape as whiteboard `scene`; absent
  // on legacy pages, so backward-compatible.
  boardScene: boardSceneSchema.optional(),
  // Page layout width. false / absent = a constrained, centered readable
  // column (~max-w-3xl); true = full container width for wide tables/embeds.
  fullWidth: z.boolean().nullable().optional(),
  // Page lock. Null/absent => 'open' (every existing page). 'open' = anyone
  // with edit rights edits normally; 'suggest' = non-privileged users get a
  // read-only editor but may still PROPOSE edits via the suggestion flow;
  // 'locked' = non-privileged users are fully read-only. "Privileged" is the
  // page creator or a node admin (enforced in canUpdateDocument below).
  lockMode: z.enum(['open', 'suggest', 'locked']).nullable().optional(),
  // Informational: who set the current lock (shown in the UI banner).
  lockedBy: z.string().nullable().optional(),
  // Reading font for the document body. Null/absent => 'default'.
  font: z.enum(['default', 'serif', 'mono']).nullable().optional(),
  // Smaller body text. Null/absent => normal size.
  smallText: z.boolean().nullable().optional(),
  // Show an auto table of contents at the top of the page. Null/absent => off.
  showToc: z.boolean().nullable().optional(),
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

    // Changing the page lock is itself privileged: a non-privileged editor
    // must not be able to flip 'suggest'/'locked' back to 'open' to sidestep
    // the document lock. When lockMode changes, require the creator or a node
    // admin. Every other attribute edit (rename, cover, width, font, …) stays
    // at editor level.
    const beforeLock =
      context.node.type === 'page' ? (context.node.lockMode ?? 'open') : 'open';
    const afterLock =
      context.attributes.type === 'page'
        ? (context.attributes.lockMode ?? 'open')
        : 'open';
    if (beforeLock !== afterLock) {
      return (
        context.node.createdBy === context.user.id ||
        hasNodeRole(role, 'admin')
      );
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

    if (!hasNodeRole(role, 'editor')) {
      return false;
    }

    // Page lock enforcement (THE server-side gate; the client only mirrors it).
    // In 'suggest' or 'locked' mode a document.update is authorised only for
    // the page's creator or a node admin ("privileged"). Non-privileged users
    // are refused here: their editor is read-only and, in 'suggest' mode, they
    // instead propose changes through the suggestion flow (which a privileged
    // reviewer later applies via their own document.update — which passes).
    // Null/absent lockMode = 'open' = the historical, unrestricted behaviour.
    if (context.node.type === 'page') {
      const lockMode = context.node.lockMode ?? 'open';
      if (lockMode === 'locked' || lockMode === 'suggest') {
        const privileged =
          context.node.createdBy === context.user.id ||
          hasNodeRole(role, 'admin');
        if (!privileged) {
          return false;
        }
      }
    }

    return true;
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
