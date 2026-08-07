import { describe, expect, it } from 'vitest';

import { computeFillSeries } from '@colanode/ui/editor/views/table-fill';

describe('computeFillSeries', () => {
  it('increments a text+number token (REQ-1 -> REQ-2 ...)', () => {
    expect(computeFillSeries(['REQ-1'], 3)).toEqual(['REQ-2', 'REQ-3', 'REQ-4']);
  });

  it('preserves zero padding', () => {
    expect(computeFillSeries(['REQ-008'], 3)).toEqual([
      'REQ-009',
      'REQ-010',
      'REQ-011',
    ]);
  });

  it('keeps a trailing suffix', () => {
    expect(computeFillSeries(['Step 1:'], 2)).toEqual(['Step 2:', 'Step 3:']);
  });

  it('copies a lone bare number (spreadsheet default)', () => {
    expect(computeFillSeries(['5'], 3)).toEqual(['5', '5', '5']);
  });

  it('detects an arithmetic step from two numbers', () => {
    expect(computeFillSeries(['1', '2'], 3)).toEqual(['3', '4', '5']);
  });

  it('detects a non-unit step', () => {
    expect(computeFillSeries(['0', '5'], 3)).toEqual(['10', '15', '20']);
  });

  it('handles a negative step', () => {
    expect(computeFillSeries(['10', '8'], 3)).toEqual(['6', '4', '2']);
  });

  it('detects a step for a text+number series', () => {
    expect(computeFillSeries(['Item 2', 'Item 4'], 2)).toEqual([
      'Item 6',
      'Item 8',
    ]);
  });

  it('cycles non-numeric values (plain copy)', () => {
    expect(computeFillSeries(['Mon', 'Tue'], 4)).toEqual([
      'Mon',
      'Tue',
      'Mon',
      'Tue',
    ]);
  });

  it('does not extend when prefixes differ', () => {
    expect(computeFillSeries(['A-1', 'B-2'], 2)).toEqual(['A-1', 'B-2']);
  });

  it('returns nothing for a non-positive count', () => {
    expect(computeFillSeries(['REQ-1'], 0)).toEqual([]);
  });

  it('fills blanks when the source is empty', () => {
    expect(computeFillSeries([], 2)).toEqual(['', '']);
  });
});
