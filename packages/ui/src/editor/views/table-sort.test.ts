import { describe, expect, it } from 'vitest';

import {
  compareCellValues,
  parseNumberLoose,
} from '@colanode/ui/editor/views/table-sort';

describe('parseNumberLoose', () => {
  it('parses plain and signed numbers', () => {
    expect(parseNumberLoose('42')).toBe(42);
    expect(parseNumberLoose('-3.5')).toBe(-3.5);
  });
  it('strips currency, percent and grouping', () => {
    expect(parseNumberLoose(' $1,234.50 ')).toBe(1234.5);
    expect(parseNumberLoose('45%')).toBe(45);
  });
  it('handles a comma decimal', () => {
    expect(parseNumberLoose('1 234,56')).toBeCloseTo(1234.56);
  });
  it('rejects non-numeric text', () => {
    expect(parseNumberLoose('REQ-1')).toBeNull();
    expect(parseNumberLoose('')).toBeNull();
    expect(parseNumberLoose('12a')).toBeNull();
  });
});

describe('compareCellValues', () => {
  it('orders numbers numerically, not lexically', () => {
    expect(compareCellValues('9', '10')).toBeLessThan(0);
    expect(compareCellValues('100', '20')).toBeGreaterThan(0);
  });
  it('sorts numbers before text', () => {
    expect(compareCellValues('5', 'apple')).toBeLessThan(0);
    expect(compareCellValues('apple', '5')).toBeGreaterThan(0);
  });
  it('sorts text naturally (REQ-2 before REQ-10)', () => {
    expect(compareCellValues('REQ-2', 'REQ-10')).toBeLessThan(0);
  });
  it('always pushes blanks last', () => {
    expect(compareCellValues('', 'x')).toBeGreaterThan(0);
    expect(compareCellValues('x', '')).toBeLessThan(0);
    expect(compareCellValues('', '')).toBe(0);
  });
  it('produces a total order for a mixed column', () => {
    const values = ['10', '', 'banana', '2', 'apple', '$1,000'];
    const asc = [...values].sort(compareCellValues);
    expect(asc).toEqual(['2', '10', '$1,000', 'apple', 'banana', '']);
  });
});
