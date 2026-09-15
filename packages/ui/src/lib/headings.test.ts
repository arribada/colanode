import { describe, expect, it } from 'vitest';

import { headingLevel, MAX_HEADING_LEVEL } from './headings';

describe('headingLevel', () => {
  it('reads every heading level the editor has', () => {
    expect(
      Array.from({ length: MAX_HEADING_LEVEL }, (_, i) =>
        headingLevel(`heading${i + 1}`)
      )
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it('is 0 for anything that is not one of those headings', () => {
    expect(headingLevel('paragraph')).toBe(0);
    expect(headingLevel('heading')).toBe(0);
    expect(headingLevel('heading6')).toBe(0);
    expect(headingLevel('heading10')).toBe(0);
    expect(headingLevel('toggleSummary')).toBe(0);
  });
});
