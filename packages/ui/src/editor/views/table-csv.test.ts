import { describe, expect, it } from 'vitest';

import { csvEscape, parseClipboardGrid } from '@colanode/ui/editor/views/table-csv';

describe('csvEscape', () => {
  it('leaves plain values untouched', () => {
    expect(csvEscape('abc')).toBe('abc');
  });
  it('quotes a value with a comma', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });
  it('doubles inner quotes', () => {
    expect(csvEscape('a"b')).toBe('"a""b"');
  });
  it('quotes a value with a newline', () => {
    expect(csvEscape('a\nb')).toBe('"a\nb"');
  });
});

describe('parseClipboardGrid', () => {
  it('parses TSV (Excel/Sheets clipboard)', () => {
    expect(parseClipboardGrid('a\tb\tc\n1\t2\t3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });
  it('parses CSV with a quoted comma', () => {
    expect(parseClipboardGrid('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });
  it('parses CSV with escaped quotes', () => {
    expect(parseClipboardGrid('"a""b",c')).toEqual([['a"b', 'c']]);
  });
  it('parses multi-row CSV', () => {
    expect(parseClipboardGrid('a,b\n1,2\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });
  it('returns null for delimiter-less prose (single or multi-line)', () => {
    expect(parseClipboardGrid('just some text')).toBeNull();
    expect(parseClipboardGrid('line one\nline two')).toBeNull();
  });
});
