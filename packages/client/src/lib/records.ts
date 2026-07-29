import {
  BooleanFieldAttributes,
  CreatedAtFieldAttributes,
  DateFieldAttributes,
  EmailFieldAttributes,
  FieldAttributes,
  isStringArray,
  NumberFieldAttributes,
  PhoneFieldAttributes,
  SelectFieldAttributes,
  TextFieldAttributes,
  UrlFieldAttributes,
  DatabaseViewFieldFilterAttributes,
  DatabaseViewFilterAttributes,
  DatabaseViewSortAttributes,
  MultiSelectFieldAttributes,
  SpecialId,
  CollaboratorFieldAttributes,
  CreatedByFieldAttributes,
  UpdatedAtFieldAttributes,
  UpdatedByFieldAttributes,
  RelationFieldAttributes,
} from '@colanode/core';

type SqliteOperator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'LIKE'
  | 'NOT LIKE'
  | 'IS'
  | 'IS NOT'
  | 'IN'
  | 'NOT IN';

export const buildFiltersQuery = (
  filters: DatabaseViewFilterAttributes[],
  fields: Record<string, FieldAttributes>,
  userId: string
): string => {
  if (filters.length === 0) {
    return '';
  }

  const filterQueries = filters
    .map((filter) => buildFilterQuery(filter, fields, userId))
    .filter((query) => query !== null);

  if (filterQueries.length === 0) {
    return '';
  }

  return `AND (${filterQueries.join(' AND ')})`;
};

const buildFilterQuery = (
  filter: DatabaseViewFilterAttributes,
  fields: Record<string, FieldAttributes>,
  userId: string
): string | null => {
  if (filter.type === 'group') {
    return null;
  }

  if (filter.fieldId === SpecialId.Name) {
    return buildNameFilterQuery(filter);
  }

  const field = fields[filter.fieldId];
  if (!field) {
    return null;
  }

  switch (field.type) {
    case 'boolean':
      return buildBooleanFilterQuery(filter, field);
    case 'collaborator':
      return buildCollaboratorFilterQuery(filter, field, userId);
    case 'created_at':
      return buildCreatedAtFilterQuery(filter, field);
    case 'created_by':
      return buildCreatedByFilterQuery(filter, field, userId);
    case 'date':
      return buildDateFilterQuery(filter, field);
    case 'email':
      return buildEmailFilterQuery(filter, field);
    case 'file':
      return null;
    case 'multi_select':
      return buildMultiSelectFilterQuery(filter, field);
    case 'number':
      return buildNumberFilterQuery(filter, field);
    case 'phone':
      return buildPhoneFilterQuery(filter, field);
    case 'relation':
      return buildRelationFilterQuery(filter, field);
    case 'select':
      return buildSelectFilterQuery(filter, field);
    case 'text':
      return buildTextFilterQuery(filter, field);
    case 'url':
      return buildUrlFilterQuery(filter, field);
    case 'updated_at':
      return buildUpdatedAtFilterQuery(filter, field);
    case 'updated_by':
      return buildUpdatedByFilterQuery(filter, field, userId);
    default:
      return null;
  }
};

const buildNameFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildAttributeFilterQuery('name', 'IS', 'NULL');
  }

  if (filter.operator === 'is_not_empty') {
    return buildAttributeFilterQuery('name', 'IS NOT', 'NULL');
  }

  if (filter.value === null) {
    return null;
  }

  if (typeof filter.value !== 'string') {
    return null;
  }

  const value = filter.value as string;
  if (!value || value.length === 0) {
    return null;
  }

  switch (filter.operator) {
    case 'is_equal_to':
      return buildAttributeFilterQuery('name', '=', `'${value}'`);
    case 'is_not_equal_to':
      return buildAttributeFilterQuery('name', '!=', `'${value}'`);
    case 'contains':
      return buildAttributeFilterQuery('name', 'LIKE', `'%${value}%'`);
    case 'does_not_contain':
      return buildAttributeFilterQuery('name', 'NOT LIKE', `'%${value}%'`);
    case 'starts_with':
      return buildAttributeFilterQuery('name', 'LIKE', `'${value}%'`);
    case 'ends_with':
      return buildAttributeFilterQuery('name', 'LIKE', `'%${value}'`);
    default:
      return null;
  }
};

const buildBooleanFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  field: BooleanFieldAttributes
): string | null => {
  if (filter.operator === 'is_true') {
    return buildFieldFilterQuery(field.id, '=', 'true');
  }

  if (filter.operator === 'is_false') {
    return `(${buildFieldFilterQuery(field.id, '=', 'false')} OR ${buildFieldFilterQuery(field.id, 'IS', 'NULL')})`;
  }

  return null;
};

const buildCollaboratorFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  field: CollaboratorFieldAttributes,
  userId: string
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildFieldArrayIsEmptyFilterQuery(field.id);
  }

  if (filter.operator === 'is_not_empty') {
    return buildFieldArrayIsNotEmptyFilterQuery(field.id);
  }

  if (filter.operator === 'is_me') {
    return buildArrayFieldContainsFilterQuery(field.id, [userId]);
  }

  if (filter.operator === 'is_not_me') {
    return buildArrayFieldDoesNotContainFilterQuery(field.id, [userId]);
  }

  if (!isStringArray(filter.value)) {
    return null;
  }

  if (filter.value.length === 0) {
    return null;
  }

  switch (filter.operator) {
    case 'is_in':
      return buildArrayFieldContainsFilterQuery(field.id, filter.value);
    case 'is_not_in':
      return buildArrayFieldDoesNotContainFilterQuery(field.id, filter.value);
    default:
      return null;
  }
};

const buildNumberFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  field: NumberFieldAttributes
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildFieldFilterQuery(field.id, 'IS', 'NULL');
  }

  if (filter.operator === 'is_not_empty') {
    return buildFieldFilterQuery(field.id, 'IS NOT', 'NULL');
  }

  if (filter.operator === 'is_between') {
    if (!isStringArray(filter.value) || filter.value.length < 2) {
      return null;
    }
    const lo = parseFloat(filter.value[0]!);
    const hi = parseFloat(filter.value[1]!);
    if (isNaN(lo) || isNaN(hi)) {
      return null;
    }
    const min = Math.min(lo, hi);
    const max = Math.max(lo, hi);
    return `(${buildFieldFilterQuery(field.id, '>=', min.toString())} AND ${buildFieldFilterQuery(field.id, '<=', max.toString())})`;
  }

  if (filter.value === null) {
    return null;
  }

  if (typeof filter.value !== 'number') {
    return null;
  }

  const value = filter.value as number;
  if (isNaN(value)) {
    return null;
  }

  switch (filter.operator) {
    case 'is_equal_to':
      return buildFieldFilterQuery(field.id, '=', value.toString());
    case 'is_not_equal_to':
      return buildFieldFilterQuery(field.id, '!=', value.toString());
    case 'is_greater_than':
      return buildFieldFilterQuery(field.id, '>', value.toString());
    case 'is_less_than':
      return buildFieldFilterQuery(field.id, '<', value.toString());
    case 'is_greater_than_or_equal_to':
      return buildFieldFilterQuery(field.id, '>=', value.toString());
    case 'is_less_than_or_equal_to':
      return buildFieldFilterQuery(field.id, '<=', value.toString());
    default:
      return null;
  }
};

const buildTextFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  field: TextFieldAttributes
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildFieldFilterQuery(field.id, 'IS', 'NULL');
  }

  if (filter.operator === 'is_not_empty') {
    return buildFieldFilterQuery(field.id, 'IS NOT', 'NULL');
  }

  if (filter.value === null) {
    return null;
  }

  if (typeof filter.value !== 'string') {
    return null;
  }

  const value = filter.value as string;
  if (!value || value.length === 0) {
    return null;
  }

  switch (filter.operator) {
    case 'is_equal_to':
      return buildFieldFilterQuery(field.id, '=', `'${value}'`);
    case 'is_not_equal_to':
      return buildFieldFilterQuery(field.id, '!=', `'${value}'`);
    case 'contains':
      return buildFieldFilterQuery(field.id, 'LIKE', `'%${value}%'`);
    case 'does_not_contain':
      return buildFieldFilterQuery(field.id, 'NOT LIKE', `'%${value}%'`);
    case 'starts_with':
      return buildFieldFilterQuery(field.id, 'LIKE', `'${value}%'`);
    case 'ends_with':
      return buildFieldFilterQuery(field.id, 'LIKE', `'%${value}'`);
    default:
      return null;
  }
};

const buildEmailFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  field: EmailFieldAttributes
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildFieldFilterQuery(field.id, 'IS', 'NULL');
  }

  if (filter.operator === 'is_not_empty') {
    return buildFieldFilterQuery(field.id, 'IS NOT', 'NULL');
  }

  if (filter.value === null) {
    return null;
  }

  if (typeof filter.value !== 'string') {
    return null;
  }

  const value = filter.value as string;
  if (!value || value.length === 0) {
    return null;
  }

  switch (filter.operator) {
    case 'is_equal_to':
      return buildFieldFilterQuery(field.id, '=', `'${value}'`);
    case 'is_not_equal_to':
      return buildFieldFilterQuery(field.id, '!=', `'${value}'`);
    case 'contains':
      return buildFieldFilterQuery(field.id, 'LIKE', `'%${value}%'`);
    case 'does_not_contain':
      return buildFieldFilterQuery(field.id, 'NOT LIKE', `'%${value}%'`);
    case 'starts_with':
      return buildFieldFilterQuery(field.id, 'LIKE', `'${value}%'`);
    case 'ends_with':
      return buildFieldFilterQuery(field.id, 'LIKE', `'%${value}'`);
    default:
      return null;
  }
};

const buildPhoneFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  field: PhoneFieldAttributes
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildFieldFilterQuery(field.id, 'IS', 'NULL');
  }

  if (filter.operator === 'is_not_empty') {
    return buildFieldFilterQuery(field.id, 'IS NOT', 'NULL');
  }

  if (filter.value === null) {
    return null;
  }

  if (typeof filter.value !== 'string') {
    return null;
  }

  const value = filter.value as string;
  if (!value || value.length === 0) {
    return null;
  }

  switch (filter.operator) {
    case 'is_equal_to':
      return buildFieldFilterQuery(field.id, '=', `'${value}'`);
    case 'is_not_equal_to':
      return buildFieldFilterQuery(field.id, '!=', `'${value}'`);
    case 'contains':
      return buildFieldFilterQuery(field.id, 'LIKE', `'%${value}%'`);
    case 'does_not_contain':
      return buildFieldFilterQuery(field.id, 'NOT LIKE', `'%${value}%'`);
    case 'starts_with':
      return buildFieldFilterQuery(field.id, 'LIKE', `'${value}%'`);
    case 'ends_with':
      return buildFieldFilterQuery(field.id, 'LIKE', `'%${value}'`);
    default:
      return null;
  }
};

const buildRelationFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  field: RelationFieldAttributes
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildFieldArrayIsEmptyFilterQuery(field.id);
  }

  if (filter.operator === 'is_not_empty') {
    return buildFieldArrayIsNotEmptyFilterQuery(field.id);
  }

  if (!isStringArray(filter.value)) {
    return null;
  }

  if (filter.value.length === 0) {
    return null;
  }

  switch (filter.operator) {
    case 'is_in':
      return buildArrayFieldContainsFilterQuery(field.id, filter.value);
    case 'is_not_in':
      return buildArrayFieldDoesNotContainFilterQuery(field.id, filter.value);
    default:
      return null;
  }
};

const buildUrlFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  field: UrlFieldAttributes
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildFieldFilterQuery(field.id, 'IS', 'NULL');
  }

  if (filter.operator === 'is_not_empty') {
    return buildFieldFilterQuery(field.id, 'IS NOT', 'NULL');
  }

  if (filter.value === null) {
    return null;
  }

  if (typeof filter.value !== 'string') {
    return null;
  }

  const value = filter.value as string;
  if (!value || value.length === 0) {
    return null;
  }

  switch (filter.operator) {
    case 'is_equal_to':
      return buildFieldFilterQuery(field.id, '=', `'${value}'`);
    case 'is_not_equal_to':
      return buildFieldFilterQuery(field.id, '!=', `'${value}'`);
    case 'contains':
      return buildFieldFilterQuery(field.id, 'LIKE', `'%${value}%'`);
    case 'does_not_contain':
      return buildFieldFilterQuery(field.id, 'NOT LIKE', `'%${value}%'`);
    case 'starts_with':
      return buildFieldFilterQuery(field.id, 'LIKE', `'${value}%'`);
    case 'ends_with':
      return buildFieldFilterQuery(field.id, 'LIKE', `'%${value}'`);
    default:
      return null;
  }
};

const buildSelectFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  field: SelectFieldAttributes
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildFieldFilterQuery(field.id, 'IS', 'NULL');
  }

  if (filter.operator === 'is_not_empty') {
    return buildFieldFilterQuery(field.id, 'IS NOT', 'NULL');
  }

  if (!isStringArray(filter.value)) {
    return null;
  }

  if (filter.value.length === 0) {
    return null;
  }

  const values = joinIds(filter.value);
  switch (filter.operator) {
    case 'is_in':
      return buildFieldFilterQuery(field.id, 'IN', `(${values})`);
    case 'is_not_in':
      return buildFieldFilterQuery(field.id, 'NOT IN', `(${values})`);
    default:
      return null;
  }
};

const buildMultiSelectFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  field: MultiSelectFieldAttributes
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildFieldArrayIsEmptyFilterQuery(field.id);
  }

  if (filter.operator === 'is_not_empty') {
    return buildFieldArrayIsNotEmptyFilterQuery(field.id);
  }

  if (!isStringArray(filter.value)) {
    return null;
  }

  if (filter.value.length === 0) {
    return null;
  }

  switch (filter.operator) {
    case 'is_in':
      return buildArrayFieldContainsFilterQuery(field.id, filter.value);
    case 'is_not_in':
      return buildArrayFieldDoesNotContainFilterQuery(field.id, filter.value);
    default:
      return null;
  }
};

const pad2 = (n: number): string => String(n).padStart(2, '0');
const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Half-open [start, endExclusive) day range (local time, YYYY-MM-DD) for the
// relative-date operators. Both bounds sort correctly against stored date
// strings and against the created_at/updated_at ISO timestamp columns.
const relativeDateRange = (
  operator: string
): { start: string; endExclusive: string } | null => {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  if (operator === 'is_today') {
    const end = new Date(startOfToday);
    end.setDate(end.getDate() + 1);
    return { start: toDateStr(startOfToday), endExclusive: toDateStr(end) };
  }
  if (operator === 'is_this_week') {
    const day = startOfToday.getDay();
    const diffToMonday = (day + 6) % 7;
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - diffToMonday);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start: toDateStr(start), endExclusive: toDateStr(end) };
  }
  if (operator === 'is_this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start: toDateStr(start), endExclusive: toDateStr(end) };
  }
  return null;
};

const buildDateFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  field: DateFieldAttributes
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildFieldFilterQuery(field.id, 'IS', 'NULL');
  }

  if (filter.operator === 'is_not_empty') {
    return buildFieldFilterQuery(field.id, 'IS NOT', 'NULL');
  }

  const relative = relativeDateRange(filter.operator);
  if (relative) {
    return `(${buildFieldFilterQuery(field.id, '>=', `'${relative.start}'`)} AND ${buildFieldFilterQuery(field.id, '<', `'${relative.endExclusive}'`)})`;
  }

  if (filter.operator === 'is_between') {
    if (!isStringArray(filter.value) || filter.value.length < 2) {
      return null;
    }
    const a = new Date(filter.value[0]!);
    const b = new Date(filter.value[1]!);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) {
      return null;
    }
    const aStr = a.toISOString().split('T')[0]!;
    const bStr = b.toISOString().split('T')[0]!;
    const lo = aStr <= bStr ? aStr : bStr;
    const hi = aStr <= bStr ? bStr : aStr;
    return `(${buildFieldFilterQuery(field.id, '>=', `'${lo}'`)} AND ${buildFieldFilterQuery(field.id, '<=', `'${hi}'`)})`;
  }

  if (filter.value === null) {
    return null;
  }

  if (typeof filter.value !== 'string') {
    return null;
  }

  const date = new Date(filter.value);
  if (isNaN(date.getTime())) {
    return null;
  }

  const dateString = date.toISOString().split('T')[0];

  switch (filter.operator) {
    case 'is_equal_to':
      return buildFieldFilterQuery(field.id, '=', `'${dateString}'`);
    case 'is_not_equal_to':
      return buildFieldFilterQuery(field.id, '!=', `'${dateString}'`);
    case 'is_on_or_after':
      return buildFieldFilterQuery(field.id, '>=', `'${dateString}'`);
    case 'is_on_or_before':
      return buildFieldFilterQuery(field.id, '<=', `'${dateString}'`);
    case 'is_after':
      return buildFieldFilterQuery(field.id, '>', `'${dateString}'`);
    case 'is_before':
      return buildFieldFilterQuery(field.id, '<', `'${dateString}'`);
    default:
      return null;
  }
};

const buildCreatedAtFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  _: CreatedAtFieldAttributes
): string | null => {
  const relative = relativeDateRange(filter.operator);
  if (relative) {
    return `(${buildColumnFilterQuery('created_at', '>=', `'${relative.start}'`)} AND ${buildColumnFilterQuery('created_at', '<', `'${relative.endExclusive}'`)})`;
  }

  if (filter.value === null) {
    return null;
  }

  if (typeof filter.value !== 'string') {
    return null;
  }

  const date = new Date(filter.value);
  if (isNaN(date.getTime())) {
    return null;
  }

  const dateString = date.toISOString().split('T')[0];

  switch (filter.operator) {
    case 'is_equal_to':
      return buildColumnFilterQuery('created_at', '=', `'${dateString}'`);
    case 'is_not_equal_to':
      return buildColumnFilterQuery('created_at', '!=', `'${dateString}'`);
    case 'is_on_or_after':
      return buildColumnFilterQuery('created_at', '>=', `'${dateString}'`);
    case 'is_on_or_before':
      return buildColumnFilterQuery('created_at', '<=', `'${dateString}'`);
    case 'is_after':
      return buildColumnFilterQuery('created_at', '>', `'${dateString}'`);
    case 'is_before':
      return buildColumnFilterQuery('created_at', '<', `'${dateString}'`);
    default:
      return null;
  }
};

const buildCreatedByFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  _: CreatedByFieldAttributes,
  userId: string
): string | null => {
  if (filter.operator === 'is_me') {
    return buildColumnFilterQuery('created_by', '=', `'${userId}'`);
  }

  if (filter.operator === 'is_not_me') {
    return buildColumnFilterQuery('created_by', '!=', `'${userId}'`);
  }

  if (!isStringArray(filter.value)) {
    return null;
  }

  if (filter.value.length === 0) {
    return null;
  }

  switch (filter.operator) {
    case 'is_in':
      return buildColumnFilterQuery(
        'created_by',
        'IN',
        `(${joinIds(filter.value)})`
      );
    case 'is_not_in':
      return buildColumnFilterQuery(
        'created_by',
        'NOT IN',
        `(${joinIds(filter.value)})`
      );
    default:
      return null;
  }
};

const buildUpdatedAtFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  _: UpdatedAtFieldAttributes
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildColumnFilterQuery('updated_at', 'IS', 'NULL');
  }

  if (filter.operator === 'is_not_empty') {
    return buildColumnFilterQuery('updated_at', 'IS NOT', 'NULL');
  }

  const relative = relativeDateRange(filter.operator);
  if (relative) {
    return `(${buildColumnFilterQuery('updated_at', '>=', `'${relative.start}'`)} AND ${buildColumnFilterQuery('updated_at', '<', `'${relative.endExclusive}'`)})`;
  }

  if (filter.value === null) {
    return null;
  }

  if (typeof filter.value !== 'string') {
    return null;
  }

  const date = new Date(filter.value);
  if (isNaN(date.getTime())) {
    return null;
  }

  const dateString = date.toISOString().split('T')[0];

  switch (filter.operator) {
    case 'is_equal_to':
      return buildColumnFilterQuery('updated_at', '=', `'${dateString}'`);
    case 'is_not_equal_to':
      return buildColumnFilterQuery('updated_at', '!=', `'${dateString}'`);
    case 'is_on_or_after':
      return buildColumnFilterQuery('updated_at', '>=', `'${dateString}'`);
    case 'is_on_or_before':
      return buildColumnFilterQuery('updated_at', '<=', `'${dateString}'`);
    case 'is_after':
      return buildColumnFilterQuery('updated_at', '>', `'${dateString}'`);
    case 'is_before':
      return buildColumnFilterQuery('updated_at', '<', `'${dateString}'`);
    default:
      return null;
  }
};

const buildUpdatedByFilterQuery = (
  filter: DatabaseViewFieldFilterAttributes,
  _: UpdatedByFieldAttributes,
  userId: string
): string | null => {
  if (filter.operator === 'is_empty') {
    return buildColumnFilterQuery('updated_by', 'IS', 'NULL');
  }

  if (filter.operator === 'is_not_empty') {
    return buildColumnFilterQuery('updated_by', 'IS NOT', 'NULL');
  }

  if (filter.operator === 'is_me') {
    return buildColumnFilterQuery('updated_by', '=', `'${userId}'`);
  }

  if (filter.operator === 'is_not_me') {
    return buildColumnFilterQuery('updated_by', '!=', `'${userId}'`);
  }

  if (!isStringArray(filter.value)) {
    return null;
  }

  if (filter.value.length === 0) {
    return null;
  }

  switch (filter.operator) {
    case 'is_in':
      return buildColumnFilterQuery(
        'updated_by',
        'IN',
        `(${joinIds(filter.value)})`
      );
    case 'is_not_in':
      return buildColumnFilterQuery(
        'updated_by',
        'NOT IN',
        `(${joinIds(filter.value)})`
      );
    default:
      return null;
  }
};

const buildFieldFilterQuery = (
  fieldId: string,
  operator: SqliteOperator,
  value: string
): string => {
  return buildAttributeFilterQuery(`fields.${fieldId}.value`, operator, value);
};

const buildAttributeFilterQuery = (
  attribute: string,
  operator: SqliteOperator,
  value: string
): string => {
  return `json_extract(n.attributes, '$.${attribute}') ${operator} ${value}`;
};

const buildColumnFilterQuery = (
  column: string,
  operator: SqliteOperator,
  value: string
): string => {
  return `n.${column} ${operator} ${value}`;
};

const buildFieldArrayIsEmptyFilterQuery = (fieldId: string): string => {
  return buildAttributeArrayIsEmptyFilterQuery(`fields.${fieldId}.value`);
};

const buildAttributeArrayIsEmptyFilterQuery = (attribute: string): string => {
  return `json_extract(n.attributes, '$.${attribute}') IS NULL OR json_array_length(json_extract(n.attributes, '$.${attribute}')) = 0`;
};

const buildFieldArrayIsNotEmptyFilterQuery = (fieldId: string): string => {
  return buildAttributeArrayIsNotEmptyFilterQuery(`fields.${fieldId}.value`);
};

const buildAttributeArrayIsNotEmptyFilterQuery = (
  attribute: string
): string => {
  return `json_extract(n.attributes, '$.${attribute}') IS NOT NULL AND json_array_length(json_extract(n.attributes, '$.${attribute}')) > 0`;
};

const buildArrayFieldContainsFilterQuery = (
  fieldId: string,
  value: string[]
): string => {
  return buildArrayAttributeContainsFilterQuery(
    `fields.${fieldId}.value`,
    value
  );
};

const buildArrayAttributeContainsFilterQuery = (
  attribute: string,
  value: string[]
): string => {
  const ids = joinIds(value);
  return `EXISTS (SELECT 1 FROM json_each(json_extract(n.attributes, '$.${attribute}')) WHERE json_each.value IN (${ids}))`;
};

const buildArrayFieldDoesNotContainFilterQuery = (
  fieldId: string,
  value: string[]
): string => {
  return buildArrayAttributeDoesNotContainFilterQuery(
    `fields.${fieldId}.value`,
    value
  );
};

const buildArrayAttributeDoesNotContainFilterQuery = (
  attribute: string,
  value: string[]
): string => {
  const ids = joinIds(value);
  return `NOT EXISTS (SELECT 1 FROM json_each(json_extract(n.attributes, '$.${attribute}')) WHERE json_each.value IN (${ids}))`;
};

const joinIds = (ids: string[]): string => {
  return ids.map((id) => `'${id}'`).join(',');
};

export const buildSortOrdersQuery = (
  sorts: DatabaseViewSortAttributes[],
  fields: Record<string, FieldAttributes>
): string => {
  return sorts
    .map((sort) => buildSortOrderQuery(sort, fields))
    .filter((query) => query !== null && query.length > 0)
    .join(', ');
};

const buildSortOrderQuery = (
  sort: DatabaseViewSortAttributes,
  fields: Record<string, FieldAttributes>
): string | null => {
  if (sort.fieldId === SpecialId.Name) {
    return `json_extract(n.attributes, '$.name') ${sort.direction}`;
  }

  const field = fields[sort.fieldId];
  if (!field) {
    return null;
  }

  if (field.type === 'created_at') {
    return `n.created_at ${sort.direction}`;
  }

  if (field.type === 'created_by') {
    return `n.created_by_id ${sort.direction}`;
  }

  return `json_extract(n.attributes, '$.fields.${field.id}.value') ${sort.direction}`;
};
