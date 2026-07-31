import { describe, expect, it } from 'vitest';

import type { FieldAttributes } from '@colanode/core';

import { evaluateRollup, formatRollupValue } from './rollup';
import type { FormulaRecordLike } from './values';

const numberField: FieldAttributes = {
  id: 'amount',
  type: 'number',
  name: 'Amount',
  index: 'a',
};

const dateField: FieldAttributes = {
  id: 'due',
  type: 'date',
  name: 'Due',
  index: 'b',
};

const boolField: FieldAttributes = {
  id: 'done',
  type: 'boolean',
  name: 'Done',
  index: 'c',
};

const textField: FieldAttributes = {
  id: 'title',
  type: 'text',
  name: 'Title',
  index: 'd',
};

const numberRecords: FormulaRecordLike[] = [
  { fields: { amount: { type: 'number', value: 10 } } },
  { fields: { amount: { type: 'number', value: 20 } } },
  { fields: { amount: { type: 'number', value: 30 } } },
  { fields: {} },
];

describe('evaluateRollup', () => {
  it('counts all related records regardless of value', () => {
    expect(evaluateRollup('count', numberField, numberRecords)).toBe(4);
    expect(evaluateRollup('count', undefined, numberRecords)).toBe(4);
  });

  it('sums numeric values', () => {
    expect(evaluateRollup('sum', numberField, numberRecords)).toBe(60);
  });

  it('averages numeric values ignoring empties', () => {
    expect(evaluateRollup('average', numberField, numberRecords)).toBe(20);
  });

  it('returns min and max', () => {
    expect(evaluateRollup('min', numberField, numberRecords)).toBe(10);
    expect(evaluateRollup('max', numberField, numberRecords)).toBe(30);
  });

  it('returns null aggregates for empty related sets', () => {
    expect(evaluateRollup('sum', numberField, [])).toBe(0);
    expect(evaluateRollup('average', numberField, [])).toBeNull();
    expect(evaluateRollup('min', numberField, [])).toBeNull();
    expect(evaluateRollup('max', numberField, [])).toBeNull();
  });

  it('computes earliest and latest dates', () => {
    const records: FormulaRecordLike[] = [
      { fields: { due: { type: 'string', value: '2024-05-10' } } },
      { fields: { due: { type: 'string', value: '2024-01-02' } } },
      { fields: { due: { type: 'string', value: '2024-09-20' } } },
    ];
    const earliest = evaluateRollup('earliest', dateField, records) as Date;
    const latest = evaluateRollup('latest', dateField, records) as Date;
    expect(earliest.getUTCFullYear()).toBe(2024);
    expect(earliest.getTime()).toBeLessThan(latest.getTime());
    expect(formatRollupValue(earliest, 'earliest')).toMatch(/2024-01-02/);
  });

  it('computes percent checked', () => {
    const records: FormulaRecordLike[] = [
      { fields: { done: { type: 'boolean', value: true } } },
      { fields: { done: { type: 'boolean', value: true } } },
      { fields: { done: { type: 'boolean', value: false } } },
      { fields: {} },
    ];
    expect(evaluateRollup('percent_checked', boolField, records)).toBe(0.5);
    expect(evaluateRollup('percent_checked', boolField, [])).toBeNull();
  });

  it('shows original values as a list', () => {
    const records: FormulaRecordLike[] = [
      { fields: { title: { type: 'string', value: 'Alpha' } } },
      { fields: { title: { type: 'string', value: 'Beta' } } },
      { fields: {} },
    ];
    const result = evaluateRollup('show_original', textField, records);
    expect(result).toEqual(['Alpha', 'Beta']);
  });
});

describe('formatRollupValue', () => {
  it('formats percentages', () => {
    expect(formatRollupValue(0.5, 'percent_checked')).toBe('50%');
  });

  it('formats numbers with limited precision', () => {
    expect(formatRollupValue(3, 'sum')).toBe('3');
    expect(formatRollupValue(3.14159, 'average')).toBe('3.14');
  });

  it('formats arrays and nulls', () => {
    expect(formatRollupValue(['a', 'b'], 'show_original')).toBe('a, b');
    expect(formatRollupValue(null, 'sum')).toBe('');
  });
});
