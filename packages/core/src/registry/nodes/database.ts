import { z } from 'zod/v4';

import {
  extractNodeRole,
  haveNodeCollaboratorsChanged,
} from '@colanode/core/lib/nodes';
import { hasNodeRole } from '@colanode/core/lib/permissions';
import { NodeModel, nodeRoleEnum } from '@colanode/core/registry/nodes/core';
import { fieldAttributesSchema } from '@colanode/core/registry/nodes/field';

export const databaseNameFieldAttributesSchema = z.object({
  name: z.string().nullable().optional(),
});

export type DatabaseNameFieldAttributes = z.infer<
  typeof databaseNameFieldAttributesSchema
>;

// --- Database automations (Notion-style trigger -> action) -----------------
// Optional, fully backward-compatible: databases created before automations
// have no `automations` key and must still parse. NEVER make these required.
export const databaseAutomationTriggerSchema = z.object({
  // record_created: fires once after a new record is inserted in the database.
  // record_updated: fires after a record's attributes change. When `fieldId`
  // is set, the automation only fires if THAT field's value changed.
  type: z.enum(['record_created', 'record_updated']),
  fieldId: z.string().nullable().optional(),
});

export type DatabaseAutomationTrigger = z.infer<
  typeof databaseAutomationTriggerSchema
>;

export const databaseAutomationActionSchema = z.object({
  // set_field: write `value` into `fieldId`.
  // ai_fill: run the AI completion with `prompt` + the record as context and
  //   write the returned text into `fieldId`.
  // notify: create a local notification (`value` is the message string).
  type: z.enum(['set_field', 'ai_fill', 'notify']),
  fieldId: z.string().nullable().optional(),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .nullable()
    .optional(),
  prompt: z.string().nullable().optional(),
});

export type DatabaseAutomationAction = z.infer<
  typeof databaseAutomationActionSchema
>;

export const databaseAutomationSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  trigger: databaseAutomationTriggerSchema,
  actions: z.array(databaseAutomationActionSchema),
});

export type DatabaseAutomation = z.infer<typeof databaseAutomationSchema>;

export const databaseAttributesSchema = z.object({
  type: z.literal('database'),
  name: z.string(),
  avatar: z.string().nullable().optional(),
  parentId: z.string(),
  index: z.string().nullable().optional(),
  fields: z.record(z.string(), fieldAttributesSchema),
  nameField: databaseNameFieldAttributesSchema.nullable().optional(),
  automations: z.array(databaseAutomationSchema).nullable().optional(),
  locked: z.boolean().nullable().optional(),
  // Optional id of a template record used as the DEFAULT for "New record":
  // when set, the plain add-record action clones this template instead of
  // inserting a blank record. Absent on older databases (backward-compatible).
  defaultTemplateId: z.string().nullable().optional(),
  collaborators: z.record(z.string(), nodeRoleEnum).optional(),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z.string().nullable().optional(),
});

export type DatabaseAttributes = z.infer<typeof databaseAttributesSchema>;

export const databaseModel: NodeModel = {
  type: 'database',
  attributesSchema: databaseAttributesSchema,
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

    return hasNodeRole(role, 'editor');
  },
  canReact: () => {
    return false;
  },
  extractText: (_, attributes) => {
    if (attributes.type !== 'database') {
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
