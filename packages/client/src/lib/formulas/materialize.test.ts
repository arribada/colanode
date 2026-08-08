import { describe, expect, it } from 'vitest';

import type { FieldAttributes } from '@colanode/core';

import {
  computeRecordFormulaValues,
  formulaValueToFieldValue,
} from './index';

describe('formulaValueToFieldValue', () => {
  it('maps a number result to a number field value', () => {
    expect(formulaValueToFieldValue(12, 'number')).toEqual({
      type: 'number',
      value: 12,
    });
  });

  it('maps a string result to a text field value', () => {
    expect(formulaValueToFieldValue('hi', 'string')).toEqual({
      type: 'text',
      value: 'hi',
    });
  });

  it('maps a boolean result to a boolean field value', () => {
    expect(formulaValueToFieldValue(true, 'boolean')).toEqual({
      type: 'boolean',
      value: true,
    });
  });

  it('stores a date as a date-only ISO string (matching date fields)', () => {
    expect(
      formulaValueToFieldValue(new Date('2024-06-01T09:30:00.000Z'), 'date')
    ).toEqual({ type: 'string', value: '2024-06-01' });
  });

  it('infers the type from the runtime value when resultType is absent', () => {
    expect(formulaValueToFieldValue(3.5)).toEqual({ type: 'number', value: 3.5 });
    expect(formulaValueToFieldValue(false)).toEqual({
      type: 'boolean',
      value: false,
    });
    expect(formulaValueToFieldValue('x')).toEqual({ type: 'text', value: 'x' });
  });

  it('returns null for null / empty results so the cell reads empty', () => {
    expect(formulaValueToFieldValue(null, 'number')).toBeNull();
    expect(formulaValueToFieldValue('', 'string')).toBeNull();
  });

  it('returns null for a non-finite number and an unparseable date', () => {
    expect(formulaValueToFieldValue(Infinity, 'number')).toBeNull();
    expect(formulaValueToFieldValue('not-a-date', 'date')).toBeNull();
  });
  it('returns null (never throws) for an invalid Date in the string branch', () => {
    expect(formulaValueToFieldValue(new Date('nope'), 'string')).toBeNull();
  });
});

describe('computeRecordFormulaValues', () => {
  const priceField: FieldAttributes = {
    id: 'f_price',
    type: 'number',
    name: 'Price',
    index: 'a',
  };
  const qtyField: FieldAttributes = {
    id: 'f_qty',
    type: 'number',
    name: 'Quantity',
    index: 'b',
  };
  const totalField: FieldAttributes = {
    id: 'f_total',
    type: 'formula',
    name: 'Total',
    index: 'c',
    expression: "prop('Price') * prop('Quantity')",
    resultType: 'number',
  };
  const brokenField: FieldAttributes = {
    id: 'f_broken',
    type: 'formula',
    name: 'Broken',
    index: 'e',
    expression: "prop('Missing') +",
    resultType: 'number',
  };

  const fields = [priceField, qtyField, totalField, brokenField];
  const record = {
    fields: {
      f_price: { type: 'number' as const, value: 4 },
      f_qty: { type: 'number' as const, value: 3 },
    },
  };

  it('materialises each formula field to its stored value', () => {
    const values = computeRecordFormulaValues(record, fields);
    expect(values.f_total).toEqual({ type: 'number', value: 12 });
  });

  it('omits an erroring formula (reads as empty)', () => {
    const values = computeRecordFormulaValues(record, fields);
    expect(values.f_broken).toBeUndefined();
  });
  it('does not materialise a time-dependent formula (now/today)', () => {
    const nowField: FieldAttributes = {
      id: 'f_now',
      type: 'formula',
      name: 'Age',
      index: 'f',
      expression: "dateBetween(prop('Created'), now(), 'days')",
      resultType: 'number',
    };
    const values = computeRecordFormulaValues(record, [...fields, nowField]);
    expect(values.f_now).toBeUndefined();
  });

  it('ignores non-formula fields', () => {
    const values = computeRecordFormulaValues(record, fields);
    expect(values.f_price).toBeUndefined();
    expect(values.f_qty).toBeUndefined();
  });
});
