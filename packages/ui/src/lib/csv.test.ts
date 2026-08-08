import { describe, expect, it } from 'vitest';

import { LocalRecordNode } from '@colanode/client/types';
import { FieldAttributes, RollupFieldAttributes } from '@colanode/core';

import {
  buildCsvImportPlan,
  buildRollupCsvValues,
  CsvImportIdGenerators,
  detectCsvDelimiter,
  exportRecordsToCsv,
  parseCsv,
  parseCsvBoolean,
  parseCsvDate,
  parseCsvNumber,
  RollupCsvContext,
  RollupCsvValues,
  sanitizeCsvFileName,
  serializeCsv,
  splitCsvMultiValues,
} from './csv';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('parses quoted cells containing delimiters', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });

  it('parses escaped quotes', () => {
    expect(parseCsv('"say ""hi""",b')).toEqual([['say "hi"', 'b']]);
  });

  it('parses newlines inside quoted cells', () => {
    expect(parseCsv('"line1\nline2",b')).toEqual([['line1\nline2', 'b']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('does not emit an extra row for a trailing newline', () => {
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']]);
  });

  it('strips a UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b')).toEqual([['a', 'b']]);
  });

  it('keeps empty cells', () => {
    expect(parseCsv('a,,c\n,,')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });

  it('auto-detects semicolon delimiters', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('respects an explicit delimiter', () => {
    expect(parseCsv('a;b\n1;2', ';')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('detectCsvDelimiter', () => {
  it('defaults to comma', () => {
    expect(detectCsvDelimiter('abc')).toBe(',');
  });

  it('detects semicolons', () => {
    expect(detectCsvDelimiter('a;b;c\n1,2')).toBe(';');
  });

  it('detects tabs', () => {
    expect(detectCsvDelimiter('a\tb\tc')).toBe('\t');
  });

  it('ignores delimiters inside quotes', () => {
    expect(detectCsvDelimiter('"a;b;c",d\n')).toBe(',');
  });
});

describe('serializeCsv', () => {
  it('joins rows with CRLF', () => {
    expect(serializeCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d');
  });

  it('quotes cells containing delimiters, quotes and newlines', () => {
    expect(serializeCsv([['a,b', 'say "hi"', 'line1\nline2']])).toBe(
      '"a,b","say ""hi""","line1\nline2"'
    );
  });

  it('round-trips through parseCsv', () => {
    const rows = [
      ['Name', 'Notes'],
      ['comma, inc', 'multi\nline "quoted"'],
      ['', 'plain'],
    ];
    expect(parseCsv(serializeCsv(rows), ',')).toEqual(rows);
  });
});

const field = (attrs: Partial<FieldAttributes> & { id: string }) =>
  ({
    type: 'text',
    name: attrs.id,
    index: 'a',
    ...attrs,
  }) as FieldAttributes;

const record = (
  name: string,
  fields: LocalRecordNode['fields'],
  extra?: Partial<LocalRecordNode>
): LocalRecordNode =>
  ({
    id: 'r1',
    type: 'record',
    name,
    fields,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    ...extra,
  }) as LocalRecordNode;

describe('exportRecordsToCsv', () => {
  const fields: FieldAttributes[] = [
    field({ id: 'f_text', type: 'text', name: 'Notes', index: 'a1' }),
    field({ id: 'f_num', type: 'number', name: 'Count', index: 'a2' }),
    field({ id: 'f_bool', type: 'boolean', name: 'Done', index: 'a3' }),
    {
      id: 'f_sel',
      type: 'select',
      name: 'Status',
      index: 'a4',
      options: {
        o1: { id: 'o1', name: 'Open', color: 'blue', index: 'a0' },
        o2: { id: 'o2', name: 'Closed', color: 'red', index: 'a1' },
      },
    },
    {
      id: 'f_multi',
      type: 'multi_select',
      name: 'Tags',
      index: 'a5',
      options: {
        t1: { id: 't1', name: 'alpha', color: 'blue', index: 'a0' },
        t2: { id: 't2', name: 'beta', color: 'red', index: 'a1' },
      },
    },
    field({ id: 'f_date', type: 'date', name: 'Due', index: 'a6' }),
    field({ id: 'f_url', type: 'url', name: 'Link', index: 'a7' }),
    field({ id: 'f_rel', type: 'relation', name: 'Parent', index: 'a8' }),
    field({ id: 'f_file', type: 'file', name: 'Attachment', index: 'a9' }),
  ];

  it('serializes supported field types and skips unsupported ones', () => {
    const records = [
      record('First', {
        f_text: { type: 'text', value: 'hello' },
        f_num: { type: 'number', value: 42 },
        f_bool: { type: 'boolean', value: true },
        f_sel: { type: 'string', value: 'o2' },
        f_multi: { type: 'string_array', value: ['t1', 't2'] },
        f_date: { type: 'string', value: '2026-03-01T00:00:00.000Z' },
        f_url: { type: 'string', value: 'https://example.org' },
        f_rel: { type: 'string_array', value: ['rec1'] },
      }),
    ];

    const result = exportRecordsToCsv(records, fields, 'Name');
    expect(result.recordCount).toBe(1);
    expect(result.skippedFields.map((f) => f.name)).toEqual([
      'Parent',
      'Attachment',
    ]);

    const rows = parseCsv(result.csv, ',');
    expect(rows[0]).toEqual([
      'Name',
      'Notes',
      'Count',
      'Done',
      'Status',
      'Tags',
      'Due',
      'Link',
    ]);
    expect(rows[1]).toEqual([
      'First',
      'hello',
      '42',
      'true',
      'Closed',
      'alpha, beta',
      '2026-03-01T00:00:00.000Z',
      'https://example.org',
    ]);
  });

  it('orders columns by field index', () => {
    const unordered = [
      field({ id: 'f_b', type: 'text', name: 'B', index: 'b' }),
      field({ id: 'f_a', type: 'text', name: 'A', index: 'a' }),
    ];
    const result = exportRecordsToCsv([], unordered, 'Name');
    expect(parseCsv(result.csv, ',')[0]).toEqual(['Name', 'A', 'B']);
  });

  it('serializes missing values as empty cells', () => {
    const result = exportRecordsToCsv(
      [record('Empty', {})],
      [field({ id: 'f_text', type: 'text', name: 'Notes', index: 'a1' })],
      'Name'
    );
    expect(parseCsv(result.csv, ',')[1]).toEqual(['Empty', '']);
  });

  it('computes and exports formula field values', () => {
    const withFormula: FieldAttributes[] = [
      field({ id: 'f_price', type: 'number', name: 'Price', index: 'a1' }),
      field({ id: 'f_qty', type: 'number', name: 'Quantity', index: 'a2' }),
      {
        id: 'f_total',
        type: 'formula',
        name: 'Total',
        index: 'a3',
        expression: "prop('Price') * prop('Quantity')",
      },
    ];
    const records = [
      record('Widget', {
        f_price: { type: 'number', value: 4 },
        f_qty: { type: 'number', value: 3 },
      }),
    ];

    const result = exportRecordsToCsv(records, withFormula, 'Name');
    // The formula column is exported, not skipped.
    expect(result.skippedFields.map((f) => f.name)).not.toContain('Total');
    const rows = parseCsv(result.csv, ',');
    expect(rows[0]).toEqual(['Name', 'Price', 'Quantity', 'Total']);
    expect(rows[1]).toEqual(['Widget', '4', '3', '12']);
  });

  it('exports precomputed rollup values and blanks records without one', () => {
    const withRollup: FieldAttributes[] = [
      field({ id: 'f_text', type: 'text', name: 'Notes', index: 'a1' }),
      {
        id: 'f_roll',
        type: 'rollup',
        name: 'Total',
        index: 'a2',
        relationFieldId: 'f_rel',
        targetFieldId: 'c_price',
        aggregation: 'sum',
      },
    ];
    const records = [
      record('Widget', { f_text: { type: 'text', value: 'hi' } }, { id: 'p1' }),
      record('Gadget', { f_text: { type: 'text', value: 'yo' } }, { id: 'p2' }),
    ];
    const rollupValues: RollupCsvValues = new Map([
      ['p1', new Map([['f_roll', '15']])],
    ]);

    const result = exportRecordsToCsv(records, withRollup, 'Name', rollupValues);
    // The rollup column is exported, not skipped.
    expect(result.skippedFields.map((f) => f.name)).not.toContain('Total');
    const rows = parseCsv(result.csv, ',');
    expect(rows[0]).toEqual(['Name', 'Notes', 'Total']);
    expect(rows[1]).toEqual(['Widget', 'hi', '15']);
    // No precomputed value for p2 -> empty cell.
    expect(rows[2]).toEqual(['Gadget', 'yo', '']);
  });
});

describe('buildRollupCsvValues', () => {
  const priceField = field({
    id: 'c_price',
    type: 'number',
    name: 'Price',
    index: 'a1',
  });
  const child1 = record(
    'Child 1',
    { c_price: { type: 'number', value: 10 } },
    { id: 'ch1' }
  );
  const child2 = record(
    'Child 2',
    { c_price: { type: 'number', value: 5 } },
    { id: 'ch2' }
  );

  const sumRollup: RollupFieldAttributes = {
    id: 'f_roll_sum',
    type: 'rollup',
    name: 'Total price',
    index: 'a9',
    relationFieldId: 'f_rel',
    targetFieldId: 'c_price',
    aggregation: 'sum',
  };
  const countRollup: RollupFieldAttributes = {
    id: 'f_roll_count',
    type: 'rollup',
    name: 'Child count',
    index: 'a10',
    relationFieldId: 'f_rel',
    targetFieldId: null,
    aggregation: 'count',
  };
  const unconfiguredRollup: RollupFieldAttributes = {
    id: 'f_roll_bad',
    type: 'rollup',
    name: 'Broken',
    index: 'a11',
    relationFieldId: null,
    targetFieldId: null,
    aggregation: null,
  };

  it('aggregates related records exactly like the RecordRollupValue cell', () => {
    const parent = record(
      'Parent',
      { f_rel: { type: 'string_array', value: ['ch1', 'ch2'] } },
      { id: 'p1' }
    );
    const relatedRecordsById = new Map<string, LocalRecordNode>([
      ['ch1', child1],
      ['ch2', child2],
    ]);
    const context = new Map<string, RollupCsvContext>([
      ['f_roll_sum', { targetField: priceField, relatedRecordsById }],
      ['f_roll_count', { targetField: undefined, relatedRecordsById }],
    ]);

    const values = buildRollupCsvValues(
      [parent],
      [sumRollup, countRollup, unconfiguredRollup],
      context
    );

    const perField = values.get('p1');
    expect(perField?.get('f_roll_sum')).toBe('15');
    expect(perField?.get('f_roll_count')).toBe('2');
    // An unconfigured rollup mirrors the cell's "Not configured" placeholder.
    expect(perField?.get('f_roll_bad')).toBe('Not configured');
  });

  it('treats missing relations as an empty related set', () => {
    const parent = record('Lonely', {}, { id: 'p2' });
    const context = new Map<string, RollupCsvContext>([
      [
        'f_roll_sum',
        { targetField: priceField, relatedRecordsById: new Map() },
      ],
      ['f_roll_count', { targetField: undefined, relatedRecordsById: new Map() }],
    ]);

    const values = buildRollupCsvValues(
      [parent],
      [sumRollup, countRollup],
      context
    );

    const perField = values.get('p2');
    // sum over nothing is 0; count of nothing is 0.
    expect(perField?.get('f_roll_sum')).toBe('0');
    expect(perField?.get('f_roll_count')).toBe('0');
  });
});

describe('csv value parsers', () => {
  it('parses booleans', () => {
    expect(parseCsvBoolean('true')).toBe(true);
    expect(parseCsvBoolean('Yes')).toBe(true);
    expect(parseCsvBoolean('1')).toBe(true);
    expect(parseCsvBoolean('false')).toBe(false);
    expect(parseCsvBoolean('No')).toBe(false);
    expect(parseCsvBoolean('0')).toBe(false);
    expect(parseCsvBoolean('')).toBeNull();
    expect(parseCsvBoolean('maybe')).toBeNull();
  });

  it('parses numbers', () => {
    expect(parseCsvNumber('42')).toBe(42);
    expect(parseCsvNumber('-3.5')).toBe(-3.5);
    expect(parseCsvNumber('3,5')).toBe(3.5);
    expect(parseCsvNumber('1,234,567')).toBe(1234567);
    expect(parseCsvNumber('1 234')).toBe(1234);
    expect(parseCsvNumber('')).toBeNull();
    expect(parseCsvNumber('abc')).toBeNull();
  });

  it('parses dates to ISO strings', () => {
    expect(parseCsvDate('2026-03-01')).toBe('2026-03-01T00:00:00.000Z');
    expect(parseCsvDate('2026-03-01T10:30:00.000Z')).toBe(
      '2026-03-01T10:30:00.000Z'
    );
    expect(parseCsvDate('25/12/2026')).toBe('2026-12-25T00:00:00.000Z');
    expect(parseCsvDate('')).toBeNull();
    expect(parseCsvDate('not a date')).toBeNull();
  });

  it('splits multi values', () => {
    expect(splitCsvMultiValues('a, b; c')).toEqual(['a', 'b', 'c']);
    expect(splitCsvMultiValues('  ')).toEqual([]);
  });
});

describe('sanitizeCsvFileName', () => {
  it('replaces forbidden characters', () => {
    expect(sanitizeCsvFileName('a/b:c*d')).toBe('a-b-c-d');
  });

  it('falls back for empty names', () => {
    expect(sanitizeCsvFileName('  ')).toBe('database');
  });
});

const generators = (): CsvImportIdGenerators => {
  let fieldCount = 0;
  let optionCount = 0;
  return {
    fieldId: () => `nf${++fieldCount}`,
    selectOptionId: () => `no${++optionCount}`,
    selectOptionColor: () => 'blue',
  };
};

describe('buildCsvImportPlan', () => {
  const existingFields: FieldAttributes[] = [
    field({ id: 'f_text', type: 'text', name: 'Notes', index: 'a1' }),
    field({ id: 'f_num', type: 'number', name: 'Count', index: 'a2' }),
    {
      id: 'f_sel',
      type: 'select',
      name: 'Status',
      index: 'a3',
      options: {
        o1: { id: 'o1', name: 'Open', color: 'blue', index: 'a0' },
      },
    },
    {
      id: 'f_multi',
      type: 'multi_select',
      name: 'Tags',
      index: 'a4',
      options: {},
    },
  ];

  it('maps name and existing fields', () => {
    const plan = buildCsvImportPlan(
      ['Name', 'Notes', 'Count'],
      [
        ['First', 'hello', '42'],
        ['Second', '', '3,5'],
      ],
      [{ type: 'name' }, { type: 'field', fieldId: 'f_text' }, { type: 'field', fieldId: 'f_num' }],
      existingFields,
      generators()
    );

    expect(plan.newFields).toEqual([]);
    expect(plan.newOptions).toEqual({});
    expect(plan.records).toEqual([
      {
        name: 'First',
        fields: {
          f_text: { type: 'text', value: 'hello' },
          f_num: { type: 'number', value: 42 },
        },
      },
      {
        name: 'Second',
        fields: {
          f_num: { type: 'number', value: 3.5 },
        },
      },
    ]);
  });

  it('skips fully empty rows', () => {
    const plan = buildCsvImportPlan(
      ['Name'],
      [['First'], ['', ''], ['Second']],
      [{ type: 'name' }],
      existingFields,
      generators()
    );
    expect(plan.records.map((r) => r.name)).toEqual(['First', 'Second']);
  });

  it('resolves existing select options case-insensitively and creates missing ones', () => {
    const plan = buildCsvImportPlan(
      ['Status'],
      [['open'], ['In Progress'], ['in progress']],
      [{ type: 'field', fieldId: 'f_sel' }],
      existingFields,
      generators()
    );

    expect(plan.records[0]!.fields).toEqual({
      f_sel: { type: 'string', value: 'o1' },
    });

    const created = plan.newOptions['f_sel']!;
    expect(created).toHaveLength(1);
    expect(created[0]!.name).toBe('In Progress');
    expect(plan.records[1]!.fields['f_sel']).toEqual({
      type: 'string',
      value: created[0]!.id,
    });
    expect(plan.records[2]!.fields['f_sel']).toEqual({
      type: 'string',
      value: created[0]!.id,
    });
  });

  it('creates options for multi select values', () => {
    const plan = buildCsvImportPlan(
      ['Tags'],
      [['alpha, beta'], ['beta; gamma']],
      [{ type: 'field', fieldId: 'f_multi' }],
      existingFields,
      generators()
    );

    const created = plan.newOptions['f_multi']!;
    expect(created.map((o) => o.name)).toEqual(['alpha', 'beta', 'gamma']);

    const first = plan.records[0]!.fields['f_multi'];
    expect(first).toEqual({
      type: 'string_array',
      value: [created[0]!.id, created[1]!.id],
    });
  });

  it('creates new text and select fields with options', () => {
    const plan = buildCsvImportPlan(
      ['Comment', 'Priority'],
      [
        ['first comment', 'High'],
        ['', 'Low'],
        ['third', 'high'],
      ],
      [
        { type: 'create-field', fieldType: 'text' },
        { type: 'create-field', fieldType: 'select' },
      ],
      existingFields,
      generators()
    );

    expect(plan.newFields).toHaveLength(2);
    const textField = plan.newFields[0]!;
    const selectField = plan.newFields[1]!;

    expect(textField.type).toBe('text');
    expect(textField.name).toBe('Comment');
    expect(selectField.type).toBe('select');
    expect(selectField.name).toBe('Priority');
    expect(textField.index < selectField.index).toBe(true);

    if (selectField.type !== 'select') {
      throw new Error('expected select field');
    }
    const optionNames = Object.values(selectField.options ?? {}).map(
      (o) => o.name
    );
    expect(optionNames.sort()).toEqual(['High', 'Low']);

    expect(plan.records[0]!.fields[textField.id]).toEqual({
      type: 'text',
      value: 'first comment',
    });
    expect(plan.records[1]!.fields[textField.id]).toBeUndefined();
    // 'high' resolves to the same option as 'High'
    expect(plan.records[2]!.fields[selectField.id]).toEqual(
      plan.records[0]!.fields[selectField.id]
    );
  });

  it('ignores skipped and unknown columns', () => {
    const plan = buildCsvImportPlan(
      ['Name', 'Ignored', 'Ghost'],
      [['First', 'x', 'y']],
      [
        { type: 'name' },
        { type: 'skip' },
        { type: 'field', fieldId: 'does-not-exist' },
      ],
      existingFields,
      generators()
    );

    expect(plan.records).toEqual([{ name: 'First', fields: {} }]);
  });

  it('parses boolean and date cells for existing fields', () => {
    const fieldsWithExtras: FieldAttributes[] = [
      ...existingFields,
      field({ id: 'f_bool', type: 'boolean', name: 'Done', index: 'a5' }),
      field({ id: 'f_date', type: 'date', name: 'Due', index: 'a6' }),
    ];

    const plan = buildCsvImportPlan(
      ['Done', 'Due'],
      [
        ['yes', '2026-03-01'],
        ['nope', 'not a date'],
      ],
      [
        { type: 'field', fieldId: 'f_bool' },
        { type: 'field', fieldId: 'f_date' },
      ],
      fieldsWithExtras,
      generators()
    );

    expect(plan.records[0]!.fields).toEqual({
      f_bool: { type: 'boolean', value: true },
      f_date: { type: 'string', value: '2026-03-01T00:00:00.000Z' },
    });
    // unparseable values are dropped rather than imported wrong
    expect(plan.records[1]!.fields).toEqual({});
  });
});
