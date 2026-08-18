import { z } from 'zod/v4';

export const selectOptionAttributesSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  index: z.string(),
});

export type SelectOptionAttributes = z.infer<
  typeof selectOptionAttributesSchema
>;

export const booleanFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('boolean'),
  name: z.string(),
  index: z.string(),
});

export type BooleanFieldAttributes = z.infer<
  typeof booleanFieldAttributesSchema
>;

export const collaboratorFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('collaborator'),
  name: z.string(),
  index: z.string(),
});

export type CollaboratorFieldAttributes = z.infer<
  typeof collaboratorFieldAttributesSchema
>;

export const createdAtFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('created_at'),
  name: z.string(),
  index: z.string(),
});

export type CreatedAtFieldAttributes = z.infer<
  typeof createdAtFieldAttributesSchema
>;

export const createdByFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('created_by'),
  name: z.string(),
  index: z.string(),
});

export type CreatedByFieldAttributes = z.infer<
  typeof createdByFieldAttributesSchema
>;

export const dateFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('date'),
  name: z.string(),
  index: z.string(),
});

export type DateFieldAttributes = z.infer<typeof dateFieldAttributesSchema>;

export const emailFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('email'),
  name: z.string(),
  index: z.string(),
});

export type EmailFieldAttributes = z.infer<typeof emailFieldAttributesSchema>;

export const fileFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('file'),
  name: z.string(),
  index: z.string(),
});

export type FileFieldAttributes = z.infer<typeof fileFieldAttributesSchema>;

// The runtime type a formula is expected to produce. It is only a rendering
// hint — the engine computes the actual value dynamically from the expression.
export const formulaResultTypeSchema = z.enum([
  'number',
  'string',
  'boolean',
  'date',
]);

export type FormulaResultType = z.infer<typeof formulaResultTypeSchema>;

export const formulaFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('formula'),
  name: z.string(),
  index: z.string(),
  // The formula source, e.g. "prop('Price') * prop('Quantity')". Evaluated
  // client-side against the record's other fields (see @colanode/client).
  expression: z.string(),
  resultType: formulaResultTypeSchema.optional().nullable(),
});

export type FormulaFieldAttributes = z.infer<
  typeof formulaFieldAttributesSchema
>;

export const multiSelectFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('multi_select'),
  name: z.string(),
  index: z.string(),
  options: z.record(z.string(), selectOptionAttributesSchema).optional(),
});

export type MultiSelectFieldAttributes = z.infer<
  typeof multiSelectFieldAttributesSchema
>;

export const numberFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('number'),
  name: z.string(),
  index: z.string(),
  // Optional display format for the number's READ rendering (the stored value
  // is never transformed). Matches NumberFormatKind in the shared number-format
  // util; absent/'plain' renders the raw number, so existing fields are
  // unaffected.
  format: z
    .enum(['plain', 'number', 'integer', 'percent', 'eur', 'usd', 'gbp'])
    .optional()
    .nullable(),
});

export type NumberFieldAttributes = z.infer<typeof numberFieldAttributesSchema>;

export const phoneFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('phone'),
  name: z.string(),
  index: z.string(),
});

export type PhoneFieldAttributes = z.infer<typeof phoneFieldAttributesSchema>;

export const relationFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('relation'),
  name: z.string(),
  index: z.string(),
  databaseId: z.string().optional().nullable(),
});

export type RelationFieldAttributes = z.infer<
  typeof relationFieldAttributesSchema
>;

// How a rollup reduces the target field across a record's related records.
export const rollupAggregationSchema = z.enum([
  'count',
  'sum',
  'average',
  'min',
  'max',
  'earliest',
  'latest',
  'percent_checked',
  'show_original',
]);

export type RollupAggregation = z.infer<typeof rollupAggregationSchema>;

export const rollupFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('rollup'),
  name: z.string(),
  index: z.string(),
  // The relation field on this database whose related records are aggregated.
  relationFieldId: z.string().optional().nullable(),
  // The field (on the related database) whose values are aggregated.
  targetFieldId: z.string().optional().nullable(),
  aggregation: rollupAggregationSchema.optional().nullable(),
});

export type RollupFieldAttributes = z.infer<typeof rollupFieldAttributesSchema>;

export const selectFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('select'),
  name: z.string(),
  index: z.string(),
  options: z.record(z.string(), selectOptionAttributesSchema).optional(),
});

export type SelectFieldAttributes = z.infer<typeof selectFieldAttributesSchema>;

export const textFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('text'),
  name: z.string(),
  index: z.string(),
});

export type TextFieldAttributes = z.infer<typeof textFieldAttributesSchema>;

export const urlFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('url'),
  name: z.string(),
  index: z.string(),
});

export type UrlFieldAttributes = z.infer<typeof urlFieldAttributesSchema>;

export const updatedAtFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('updated_at'),
  name: z.string(),
  index: z.string(),
});

export type UpdatedAtFieldAttributes = z.infer<
  typeof updatedAtFieldAttributesSchema
>;

export const updatedByFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('updated_by'),
  name: z.string(),
  index: z.string(),
});

export type UpdatedByFieldAttributes = z.infer<
  typeof updatedByFieldAttributesSchema
>;

export const ratingFieldAttributesSchema = z.object({
  id: z.string(),
  type: z.literal('rating'),
  name: z.string(),
  index: z.string(),
  // Number of stars (default 5). The value itself is stored as a plain number
  // field value, clamped to [0, max] by the UI.
  max: z.number().int().min(1).max(10).optional().nullable(),
});

export type RatingFieldAttributes = z.infer<typeof ratingFieldAttributesSchema>;

export const fieldAttributesSchema = z.discriminatedUnion('type', [
  booleanFieldAttributesSchema,
  collaboratorFieldAttributesSchema,
  createdAtFieldAttributesSchema,
  createdByFieldAttributesSchema,
  dateFieldAttributesSchema,
  emailFieldAttributesSchema,
  fileFieldAttributesSchema,
  formulaFieldAttributesSchema,
  multiSelectFieldAttributesSchema,
  numberFieldAttributesSchema,
  phoneFieldAttributesSchema,
  relationFieldAttributesSchema,
  rollupFieldAttributesSchema,
  ratingFieldAttributesSchema,
  selectFieldAttributesSchema,
  textFieldAttributesSchema,
  urlFieldAttributesSchema,
  updatedAtFieldAttributesSchema,
  updatedByFieldAttributesSchema,
]);

export type FieldAttributes = z.infer<typeof fieldAttributesSchema>;

export type FieldType = Extract<FieldAttributes['type'], string>;
