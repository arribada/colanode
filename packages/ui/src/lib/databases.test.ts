import { describe, expect, it } from 'vitest';

import { DatabaseViewLayout } from '@colanode/core';

import {
  GALLERY_CARD_MAX_FIELDS,
  getDefaultViewFieldDisplay,
  getEffectiveFilterOperator,
  getGalleryCoverColorClass,
  getSetFilterMode,
  withEffectiveOperator,
} from './databases';

describe('getDefaultViewFieldDisplay', () => {
  it('displays fields by default only for table layouts', () => {
    const expectations: Record<DatabaseViewLayout, boolean> = {
      table: true,
      board: false,
      calendar: false,
      gallery: false,
      list: false,
      chart: false,
      timeline: false,
    };

    for (const [layout, expected] of Object.entries(expectations)) {
      expect(getDefaultViewFieldDisplay(layout as DatabaseViewLayout)).toBe(
        expected
      );
    }
  });
});

describe('getGalleryCoverColorClass', () => {
  it('is deterministic for the same record id', () => {
    expect(getGalleryCoverColorClass('rec_123')).toBe(
      getGalleryCoverColorClass('rec_123')
    );
  });

  it('returns a background class pair', () => {
    const color = getGalleryCoverColorClass('rec_abc');
    expect(color).toMatch(/^bg-[a-z]+-100 dark:bg-[a-z]+-900$/);
  });

  it('handles empty ids', () => {
    expect(getGalleryCoverColorClass('')).toMatch(/^bg-/);
  });

  it('spreads different ids across multiple colors', () => {
    const colors = new Set(
      Array.from({ length: 32 }, (_, i) =>
        getGalleryCoverColorClass(`rec_${i}`)
      )
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('GALLERY_CARD_MAX_FIELDS', () => {
  it('caps the number of fields shown on a gallery card', () => {
    expect(GALLERY_CARD_MAX_FIELDS).toBeGreaterThan(0);
  });
});

describe('getSetFilterMode', () => {
  it('reads the two set operators', () => {
    expect(getSetFilterMode('is_in')).toBe('include');
    expect(getSetFilterMode('is_not_in')).toBe('exclude');
  });

  it('refuses to guess for anything else', () => {
    // This is the regression that mattered. The three set builders used to end
    // with `operator === 'is_in' ? combined : not(combined)`, so a stored
    // 'equals' returned every record EXCEPT the one asked for -- a filter that
    // looks broken rather than inverted, because the view simply stays full.
    expect(getSetFilterMode('equals')).toBeNull();
    expect(getSetFilterMode('is_empty')).toBeNull();
    expect(getSetFilterMode('is_me')).toBeNull();
    expect(getSetFilterMode('')).toBeNull();
  });
});

describe('getEffectiveFilterOperator', () => {
  it('leaves a valid operator alone', () => {
    expect(getEffectiveFilterOperator('select', 'is_not_in')).toBe('is_not_in');
    expect(getEffectiveFilterOperator('select', 'is_empty')).toBe('is_empty');
    expect(getEffectiveFilterOperator('text', 'does_not_contain')).toBe(
      'does_not_contain'
    );
  });

  it('resolves an unknown operator to the one the panel displays', () => {
    // Two views in production store operator 'equals' on a select field while
    // their popover draws "Is In", because the popover falls back to
    // operators[0] and never writes it back.
    expect(getEffectiveFilterOperator('select', 'equals')).toBe('is_in');
    expect(getEffectiveFilterOperator('text', 'equals')).toBe('contains');
    expect(getEffectiveFilterOperator('created_by', 'equals')).toBe('is_me');
  });

  it('leaves a type that declares no operators untouched', () => {
    // getFieldFilterOperators has no case for updated_by, so there is nothing
    // to resolve against and inventing a default would be worse than nothing.
    expect(getEffectiveFilterOperator('updated_by', 'equals')).toBe('equals');
    expect(getEffectiveFilterOperator('updated_at', 'whatever')).toBe(
      'whatever'
    );
  });
});

describe('withEffectiveOperator', () => {
  it('returns the very same object when nothing needs resolving', () => {
    // Identity matters: this runs per record per filter inside the live query.
    const filter = { fieldId: 'f1', operator: 'is_in', value: ['a'] };
    expect(withEffectiveOperator(filter, 'select')).toBe(filter);
  });

  it('corrects the operator and keeps every other field', () => {
    const filter = { fieldId: 'f1', operator: 'equals', value: ['a'] };
    const resolved = withEffectiveOperator(filter, 'select');
    expect(resolved).not.toBe(filter);
    expect(resolved.operator).toBe('is_in');
    expect(resolved.value).toEqual(['a']);
    expect(resolved.fieldId).toBe('f1');
    expect(filter.operator).toBe('equals');
  });
});
