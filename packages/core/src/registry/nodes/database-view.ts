import { z } from 'zod/v4';

import { extractNodeRole } from '@colanode/core/lib/nodes';
import { hasNodeRole } from '@colanode/core/lib/permissions';
import { NodeModel } from '@colanode/core/registry/nodes/core';

export const databaseViewFieldAttributesSchema = z.object({
  id: z.string(),
  width: z.number().nullable().optional(),
  display: z.boolean().nullable().optional(),
  index: z.string().nullable().optional(),
});

export type DatabaseViewFieldAttributes = z.infer<
  typeof databaseViewFieldAttributesSchema
>;

export const databaseViewFieldFilterAttributesSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  type: z.literal('field'),
  operator: z.string(),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .nullable()
    .optional(),
});

export type DatabaseViewFieldFilterAttributes = z.infer<
  typeof databaseViewFieldFilterAttributesSchema
>;

export const databaseViewGroupFilterAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('group'),
  operator: z.enum(['and', 'or']),
  filters: z.array(databaseViewFieldFilterAttributesSchema),
});

export type DatabaseViewGroupFilterAttributes = z.infer<
  typeof databaseViewGroupFilterAttributesSchema
>;

export const databaseViewSortAttributesSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  direction: z.enum(['asc', 'desc']),
});

export type DatabaseViewSortAttributes = z.infer<
  typeof databaseViewSortAttributesSchema
>;

// A single conditional-color rule: when a record matches the field/operator/
// value condition (evaluated with the same logic as view filters), its row
// (table/list) or card (board/gallery) is tinted with `color` (a select-option
// color value, e.g. 'green'). OPTIONAL on the view; existing views omit it.
export const databaseViewConditionalColorAttributesSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  operator: z.string(),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .nullable()
    .optional(),
  color: z.string(),
});

export type DatabaseViewConditionalColorAttributes = z.infer<
  typeof databaseViewConditionalColorAttributesSchema
>;

export const databaseViewFilterAttributesSchema = z.discriminatedUnion('type', [
  databaseViewFieldFilterAttributesSchema,
  databaseViewGroupFilterAttributesSchema,
]);

export type DatabaseViewFilterAttributes = z.infer<
  typeof databaseViewFilterAttributesSchema
>;

// Chart view config. A chart view aggregates the same filtered/sorted
// records as any other view, grouping them by one field and reducing each
// group to a single number (count of records, or sum/average of a numeric
// field), then rendered as a pie, bar or line chart.
export const databaseViewChartTypeSchema = z.enum(['pie', 'bar', 'line']);

export type DatabaseViewChartType = z.infer<typeof databaseViewChartTypeSchema>;

export const databaseViewChartAggregateSchema = z.enum([
  'count',
  'sum',
  'average',
]);

export type DatabaseViewChartAggregate = z.infer<
  typeof databaseViewChartAggregateSchema
>;

export const databaseViewChartAttributesSchema = z.object({
  // The kind of chart to draw.
  type: databaseViewChartTypeSchema,
  // Field the records are grouped by (a select/multi_select/relation/
  // collaborator/boolean/date/text/... field id, or the special "name" id).
  groupBy: z.string().nullable().optional(),
  // How each group is reduced to a number. Defaults to count.
  aggregate: databaseViewChartAggregateSchema.optional().nullable(),
  // The numeric field summed/averaged when aggregate is sum/average.
  valueFieldId: z.string().nullable().optional(),
  // Per-series colours the user picked on the legend, keyed by bucket. Absent
  // keys fall back to the select option's own colour, then to the palette.
  colors: z.record(z.string(), z.string()).optional().nullable(),
});

export type DatabaseViewChartAttributes = z.infer<
  typeof databaseViewChartAttributesSchema
>;

export const databaseViewAttributesSchema = z.object({
  type: z.literal('database_view'),
  parentId: z.string(),
  layout: z.enum(['table', 'board', 'calendar', 'gallery', 'list', 'chart']),
  name: z.string(),
  avatar: z.string().nullable().optional(),
  index: z.string(),
  fields: z
    .record(z.string(), databaseViewFieldAttributesSchema)
    .optional()
    .nullable(),
  filters: z
    .record(z.string(), databaseViewFilterAttributesSchema)
    .optional()
    .nullable(),
  sorts: z
    .record(z.string(), databaseViewSortAttributesSchema)
    .optional()
    .nullable(),
  groupBy: z.string().nullable().optional(),
  nameWidth: z.number().nullable().optional(),
  chart: databaseViewChartAttributesSchema.optional().nullable(),
  // OPTIONAL list of conditional-color rules. Absent on existing views.
  conditionalColors: z
    .array(databaseViewConditionalColorAttributesSchema)
    .optional()
    .nullable(),
});

export type DatabaseViewAttributes = z.infer<
  typeof databaseViewAttributesSchema
>;
export type DatabaseViewLayout =
  'table' | 'board' | 'calendar' | 'gallery' | 'list' | 'chart';

export const databaseViewModel: NodeModel = {
  type: 'database_view',
  attributesSchema: databaseViewAttributesSchema,
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
    if (attributes.type !== 'database_view') {
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
