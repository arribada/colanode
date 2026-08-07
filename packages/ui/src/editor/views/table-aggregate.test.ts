import { describe, expect, it } from 'vitest';

import {
  computeAggregate,
  formatAggregate,
} from '@colanode/ui/editor/views/table-aggregate';

describe('computeAggregate', () => {
  const col = ['10', '20', '30', '', 'n/a', '$5'];

  it('sums the numeric cells', () => {
    expect(computeAggregate(col, 'sum')).toBe(65);
  });
  it('averages only the numeric cells', () => {
    expect(computeAggregate(['10', '20', '30'], 'avg')).toBe(20);
  });
  it('counts non-empty cells (COUNTA)', () => {
    expect(computeAggregate(col, 'count')).toBe(5);
  });
  it('takes min and max over numbers', () => {
    expect(computeAggregate(col, 'min')).toBe(5);
    expect(computeAggregate(col, 'max')).toBe(30);
  });
  it('sums to 0 but returns null for avg/min/max on an all-text column', () => {
    expect(computeAggregate(['a', 'b'], 'sum')).toBe(0);
    expect(computeAggregate(['a', 'b'], 'avg')).toBeNull();
    expect(computeAggregate(['a', 'b'], 'min')).toBeNull();
  });
});

describe('formatAggregate', () => {
  it('shows an em dash for null', () => {
    expect(formatAggregate(null, 'avg')).toBe('—');
  });
  it('keeps counts as plain integers', () => {
    expect(formatAggregate(5, 'count')).toBe('5');
  });
  it('rounds to at most two decimals', () => {
    expect(formatAggregate(20.126, 'avg')).toBe('20.13');
    expect(formatAggregate(20, 'sum')).toBe('20');
  });
});
