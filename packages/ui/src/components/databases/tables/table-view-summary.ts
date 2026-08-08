// ABOUTME: Pure helpers for the table-view column summary footer — the set of
// ABOUTME: aggregation kinds and a computeSummaryValue that reduces the records.
import { LocalRecordNode } from '@colanode/client/types';
import { FieldAttributes } from '@colanode/core';

export type SummaryKind =
  | 'none'
  | 'count_all'
  | 'count_values'
  | 'count_empty'
  | 'sum'
  | 'average'
  | 'min'
  | 'max'
  | 'range';

export interface SummaryOption {
  value: SummaryKind;
  label: string;
}

// The count-* summaries apply to any column (they only look at presence).
export const COUNT_SUMMARIES: SummaryOption[] = [
  { value: 'count_all', label: 'Count all' },
  { value: 'count_values', label: 'Count values' },
  { value: 'count_empty', label: 'Count empty' },
];

// The numeric summaries need parseable numbers and are only offered on numeric
// columns (number / formula / rollup).
export const NUMERIC_SUMMARIES: SummaryOption[] = [
  { value: 'sum', label: 'Sum' },
  { value: 'average', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'range', label: 'Range' },
];

export const SUMMARY_LABELS: Record<SummaryKind, string> = {
  none: 'None',
  count_all: 'Count all',
  count_values: 'Count values',
  count_empty: 'Count empty',
  sum: 'Sum',
  average: 'Average',
  min: 'Min',
  max: 'Max',
  range: 'Range',
};

// Kinds whose result is a numeric quantity (right-aligned, honors number
// formatting). The count-* kinds are plain integer tallies.
export const NUMERIC_SUMMARY_KINDS: SummaryKind[] = [
  'sum',
  'average',
  'min',
  'max',
  'range',
];

// A field whose values can be reduced with sum/avg/min/max/range. `null` is the
// special record-name column, which is never numeric.
export const isNumericSummaryField = (
  field: FieldAttributes | null
): boolean => {
  if (!field) {
    return false;
  }
  return (
    field.type === 'number' ||
    field.type === 'formula' ||
    field.type === 'rollup'
  );
};

// Raw value for a record in a given column. The special name column (field
// null) reads record.name; every other column reads the stored field value.
const getRawValue = (
  record: LocalRecordNode,
  field: FieldAttributes | null
): unknown => {
  if (!field) {
    return record.name;
  }
  return record.fields[field.id]?.value;
};

// "Has a value" — a non-empty string, a non-empty array, or any number/boolean.
const isPresent = (raw: unknown): boolean => {
  if (raw === null || raw === undefined) {
    return false;
  }
  if (typeof raw === 'string') {
    return raw.trim().length > 0;
  }
  if (Array.isArray(raw)) {
    return raw.length > 0;
  }
  return true;
};

// Coerce a raw value to a finite number (number as-is, numeric string parsed),
// or null when it is not a number — mirrors the chart view's getNumericValue.
const toNumber = (raw: unknown): number | null => {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

// Reduce the records for one column to the chosen summary. Returns null when
// there is nothing to show (kind 'none', or a numeric kind over no numbers);
// counts always return a number. Formatting is left to the caller.
export const computeSummaryValue = (
  records: LocalRecordNode[],
  field: FieldAttributes | null,
  kind: SummaryKind
): number | null => {
  if (kind === 'none') {
    return null;
  }

  if (kind === 'count_all') {
    return records.length;
  }

  if (kind === 'count_values' || kind === 'count_empty') {
    let present = 0;
    for (const record of records) {
      if (isPresent(getRawValue(record, field))) {
        present += 1;
      }
    }
    return kind === 'count_values' ? present : records.length - present;
  }

  const numbers: number[] = [];
  for (const record of records) {
    const value = toNumber(getRawValue(record, field));
    if (value !== null) {
      numbers.push(value);
    }
  }

  if (kind === 'sum') {
    return numbers.reduce((total, value) => total + value, 0);
  }

  if (numbers.length === 0) {
    return null;
  }

  switch (kind) {
    case 'average':
      return (
        numbers.reduce((total, value) => total + value, 0) / numbers.length
      );
    case 'min':
      return Math.min(...numbers);
    case 'max':
      return Math.max(...numbers);
    case 'range':
      return Math.max(...numbers) - Math.min(...numbers);
    default:
      return null;
  }
};
