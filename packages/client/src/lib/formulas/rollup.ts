// Client-side rollup aggregation: reduces a target field across a record's
// related records into a single value for the rollup field.

import { FieldAttributes, RollupAggregation } from '@colanode/core';

import {
  coerceDate,
  coerceNumber,
  coerceString,
  FormulaRecordLike,
  FormulaValue,
} from './values';

export type RollupValue = number | string | boolean | Date | string[] | null;

const targetValue = (
  field: FieldAttributes,
  record: FormulaRecordLike
): FormulaValue => {
  const raw = record.fields[field.id];
  switch (field.type) {
    case 'number':
      return raw && raw.type === 'number' ? raw.value : null;
    case 'boolean':
      return raw && raw.type === 'boolean' ? raw.value : false;
    case 'date':
      return raw && raw.type === 'string' ? coerceDate(raw.value) : null;
    case 'created_at':
      return record.createdAt ? coerceDate(record.createdAt) : null;
    case 'updated_at':
      return record.updatedAt ? coerceDate(record.updatedAt) : null;
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
    case 'select':
      return raw && (raw.type === 'string' || raw.type === 'text')
        ? raw.value
        : null;
    case 'created_by':
      return record.createdBy ?? null;
    case 'updated_by':
      return record.updatedBy ?? null;
    case 'multi_select':
    case 'collaborator':
    case 'relation':
      return raw && raw.type === 'string_array' ? raw.value.join(', ') : null;
    default:
      return null;
  }
};

const numbers = (values: FormulaValue[]): number[] =>
  values
    .map((v) => coerceNumber(v))
    .filter((n): n is number => n !== null);

const toDates = (values: FormulaValue[]): Date[] =>
  values
    .map((v) => coerceDate(v))
    .filter((d): d is Date => d !== null);

export const evaluateRollup = (
  aggregation: RollupAggregation,
  targetField: FieldAttributes | undefined,
  relatedRecords: FormulaRecordLike[]
): RollupValue => {
  if (aggregation === 'count') {
    return relatedRecords.length;
  }

  if (!targetField) {
    return null;
  }

  const values = relatedRecords
    .map((record) => targetValue(targetField, record))
    .filter((value): value is Exclude<FormulaValue, null> => value !== null);

  switch (aggregation) {
    case 'sum':
      return numbers(values).reduce((a, b) => a + b, 0);
    case 'average': {
      const nums = numbers(values);
      if (nums.length === 0) return null;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    case 'min': {
      const nums = numbers(values);
      return nums.length ? Math.min(...nums) : null;
    }
    case 'max': {
      const nums = numbers(values);
      return nums.length ? Math.max(...nums) : null;
    }
    case 'earliest': {
      const dates = toDates(values);
      if (dates.length === 0) return null;
      return new Date(Math.min(...dates.map((d) => d.getTime())));
    }
    case 'latest': {
      const dates = toDates(values);
      if (dates.length === 0) return null;
      return new Date(Math.max(...dates.map((d) => d.getTime())));
    }
    case 'percent_checked': {
      if (relatedRecords.length === 0) return null;
      const checked = relatedRecords.filter(
        (record) => targetValue(targetField, record) === true
      ).length;
      return checked / relatedRecords.length;
    }
    case 'show_original':
      return values.map((value) => coerceString(value));
    default:
      return null;
  }
};

export const formatRollupValue = (
  value: RollupValue,
  aggregation: RollupAggregation
): string => {
  if (value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (aggregation === 'percent_checked') {
      return `${Math.round(value * 100)}%`;
    }
    return Number.isInteger(value)
      ? String(value)
      : String(Math.round(value * 100) / 100);
  }
  return String(value);
};
