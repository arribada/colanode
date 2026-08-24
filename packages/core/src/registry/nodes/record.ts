import { z } from 'zod/v4';

import { extractBlocksMentions } from '@colanode/core/lib/mentions';
import { extractNodeRole } from '@colanode/core/lib/nodes';
import { hasNodeRole } from '@colanode/core/lib/permissions';
import { richTextContentSchema } from '@colanode/core/registry/documents/rich-text';
import {
  NodeModel,
  nodeCoverSchema,
} from '@colanode/core/registry/nodes/core';
import { fieldValueSchema } from '@colanode/core/registry/nodes/field-value';

export const recordAttributesSchema = z.object({
  type: z.literal('record'),
  parentId: z.string(),
  databaseId: z.string(),
  name: z.string(),
  avatar: z.string().nullable().optional(),
  cover: nodeCoverSchema.nullable().optional(),
  sourceMessageId: z.string().nullable().optional(),
  fields: z.record(z.string(), fieldValueSchema),
  // Template records are regular records living in the same database, kept
  // out of the browsing collection (see notTemplateSql) and surfaced only
  // through the dedicated record.template.list query / "New from template"
  // menus. Saving a record as a template deep-copies its fields + document
  // into a new record with this flag set; the source record is untouched.
  isTemplate: z.boolean().nullable().optional(),
  // Lock + version, mirrored from pages so a database record page has the same
  // controls. lockMode gates document edits (canUpdateDocument); version /
  // versionLog are a git-like tag + append-only log shown in the header.
  lockMode: z.enum(['open', 'suggest', 'locked']).nullable().optional(),
  lockedBy: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  versionLog: z
    .array(
      z.object({
        version: z.string(),
        at: z.string(),
        by: z.string(),
        note: z.string().nullable().optional(),
      })
    )
    .nullable()
    .optional(),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z.string().nullable().optional(),
});

export type RecordAttributes = z.infer<typeof recordAttributesSchema>;

export const recordModel: NodeModel = {
  type: 'record',
  attributesSchema: recordAttributesSchema,
  documentSchema: richTextContentSchema,
  canCreate: (context) => {
    if (context.tree.length === 0) {
      return false;
    }

    const role = extractNodeRole(context.tree, context.user.id);
    if (!role) {
      return false;
    }

    return hasNodeRole(role, 'collaborator');
  },
  canUpdateAttributes: (context) => {
    if (context.tree.length === 0) {
      return false;
    }

    const role = extractNodeRole(context.tree, context.user.id);
    if (!role) {
      return false;
    }

    if (context.node.createdBy === context.user.id) {
      return true;
    }

    // Changing the lock is privileged: a plain editor must not flip
    // suggest/locked back to open to bypass it (the creator returned
    // above; here that leaves admins).
    const beforeLock =
      context.node.type === 'record'
        ? (context.node.lockMode ?? 'open')
        : 'open';
    const afterLock =
      context.attributes.type === 'record'
        ? (context.attributes.lockMode ?? 'open')
        : 'open';
    if (beforeLock !== afterLock) {
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

    if (context.node.createdBy === context.user.id) {
      return true;
    }

    // Lock enforcement (server-side gate; the client mirrors it). In
    // locked/suggest a non-creator edits the document only as an admin;
    // others are read-only and suggest instead. Open/absent = unrestricted.
    if (context.node.type === 'record') {
      const lockMode = context.node.lockMode ?? 'open';
      if (
        (lockMode === 'locked' || lockMode === 'suggest') &&
        !hasNodeRole(role, 'admin')
      ) {
        return false;
      }
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

    if (context.node.createdBy === context.user.id) {
      return true;
    }

    return hasNodeRole(role, 'admin');
  },
  canReact: () => {
    return false;
  },
  extractText: (id, attributes) => {
    if (attributes.type !== 'record') {
      throw new Error('Invalid node type');
    }

    const texts: string[] = [];
    for (const field of Object.values(attributes.fields)) {
      if (field.type === 'string') {
        texts.push(field.value);
      }
    }

    return {
      name: attributes.name,
      attributes: texts.join('\n'),
    };
  },
  extractMentions: () => {
    return [];
  },
  extractDocumentMentions: (id, content) => {
    return extractBlocksMentions(id, content.blocks);
  },
};
