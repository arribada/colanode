// Runtime value model for formulas plus coercion helpers shared by the
// evaluator, built-in functions and rollup aggregations.

import type { FieldValue } from '@colanode/core';

export type FormulaValue = number | string | boolean | Date | null;

export interface FormulaRecordLike {
  fields: Record<string, FieldValue>;
  name?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export const coerceNumber = (value: FormulaValue): number | null => {
  if (value === null) return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) {
    const t = value.getTime();
    return isNaN(t) ? null : t;
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return isNaN(n) ? null : n;
};

export const coerceDate = (value: FormulaValue): Date | null => {
  if (value === null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'boolean') return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

export const coerceString = (value: FormulaValue): string => {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

export const coerceBoolean = (value: FormulaValue): boolean => {
  if (value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0 && !isNaN(value);
  if (value instanceof Date) return !isNaN(value.getTime());
  return value.length > 0;
};

export const valuesEqual = (a: FormulaValue, b: FormulaValue): boolean => {
  if (a === null || b === null) return a === b;
  if (a instanceof Date || b instanceof Date) {
    const da = coerceDate(a);
    const db = coerceDate(b);
    if (da && db) return da.getTime() === db.getTime();
    return false;
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const na = coerceNumber(a);
    const nb = coerceNumber(b);
    if (na !== null && nb !== null) return na === nb;
    return coerceString(a) === coerceString(b);
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return coerceBoolean(a) === coerceBoolean(b);
  }
  return coerceString(a) === coerceString(b);
};

// Returns a negative/zero/positive number like a comparator, or null when the
// two values are not comparable (e.g. one is empty).
export const compareValues = (
  a: FormulaValue,
  b: FormulaValue
): number | null => {
  if (a === null || b === null) return null;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  const na = coerceNumber(a);
  const nb = coerceNumber(b);
  if (na !== null && nb !== null) {
    return na - nb;
  }
  const sa = coerceString(a);
  const sb = coerceString(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
};
