import { describe, expect, it } from 'vitest';

import { sideForPointer } from '@colanode/ui/editor/extensions/columns-drag';

// A 250px image drawn at x 100..350, the way an image block shows on a page.
const image = { left: 100, right: 350, width: 250 };

describe('sideForPointer', () => {
  it('arms the right side in the empty space beside a narrow image', () => {
    expect(sideForPointer(390, image)).toBe('right');
    expect(sideForPointer(900, image)).toBe('right');
  });

  it('arms each side near its edge and nothing in the middle', () => {
    expect(sideForPointer(110, image)).toBe('left');
    expect(sideForPointer(340, image)).toBe('right');
    expect(sideForPointer(225, image)).toBeNull();
  });

  it('arms the left side before the block', () => {
    expect(sideForPointer(40, image)).toBe('left');
  });
});
