import { describe, expect, it } from 'vitest';

import {
  EMPTY_SEARCH_FILTERS,
  hasNarrowingFilters,
  isDefaultSearchFilters,
  resolveCustomRange,
  resolveDatePreset,
  toDateInputValue,
  toNodeSearchFilters,
} from '@colanode/ui/lib/search-filters';

describe('resolveDatePreset', () => {
  const now = new Date(2026, 10, 20, 15, 30);

  it('starts "today" at local midnight', () => {
    const date = resolveDatePreset('edited', 'today', now);
    expect(new Date(date.from!).getTime()).toBe(
      new Date(2026, 10, 20).getTime()
    );
    expect(date.to).toBeNull();
  });

  it('goes back seven or thirty days from now', () => {
    const week = resolveDatePreset('created', 'last7', now);
    expect(now.getTime() - new Date(week.from!).getTime()).toBe(
      7 * 24 * 3600 * 1000
    );
    expect(week.field).toBe('created');
    const month = resolveDatePreset('edited', 'last30', now);
    expect(now.getTime() - new Date(month.from!).getTime()).toBe(
      30 * 24 * 3600 * 1000
    );
  });
});

describe('resolveCustomRange', () => {
  it('includes the last day of the range', () => {
    const range = resolveCustomRange('edited', '2026-11-01', '2026-11-03')!;
    expect(new Date(range.from!).getTime()).toBe(
      new Date(2026, 10, 1).getTime()
    );
    expect(new Date(range.to!).getTime()).toBe(new Date(2026, 10, 4).getTime());
    expect(toDateInputValue(range.from)).toBe('2026-11-01');
    expect(toDateInputValue(range.to, true)).toBe('2026-11-03');
  });

  it('accepts an open end and drops an empty range', () => {
    expect(resolveCustomRange('edited', '2026-11-01', null)?.to).toBeNull();
    expect(resolveCustomRange('edited', null, null)).toBeNull();
    expect(resolveCustomRange('edited', 'nonsense', '')).toBeNull();
  });
});

describe('toNodeSearchFilters', () => {
  it('passes every chip to the query', () => {
    expect(
      toNodeSearchFilters(
        {
          ...EMPTY_SEARCH_FILTERS,
          titleOnly: true,
          types: ['page'],
          createdBy: ['u1'],
          within: { id: 'n1', name: 'Field' },
          date: {
            field: 'created',
            preset: 'custom',
            from: '2026-01-01T00:00:00.000Z',
            to: null,
          },
        },
        false
      )
    ).toEqual({
      titleOnly: true,
      types: ['page'],
      createdBy: ['u1'],
      withinId: 'n1',
      dateField: 'created',
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: null,
      includeChat: false,
    });
  });
});

describe('filter state', () => {
  it('tells narrowing filters from the order and "title only"', () => {
    expect(isDefaultSearchFilters(EMPTY_SEARCH_FILTERS)).toBe(true);
    const sorted = { ...EMPTY_SEARCH_FILTERS, sort: 'edited_desc' as const };
    expect(isDefaultSearchFilters(sorted)).toBe(false);
    expect(hasNarrowingFilters(sorted)).toBe(false);
    expect(
      hasNarrowingFilters({ ...EMPTY_SEARCH_FILTERS, createdBy: ['u1'] })
    ).toBe(true);
  });
});
