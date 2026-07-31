import { describe, expect, it } from 'vitest';

import { DatabaseViewLayout } from '@colanode/core';

import {
  GALLERY_CARD_MAX_FIELDS,
  getDefaultViewFieldDisplay,
  getGalleryCoverColorClass,
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
