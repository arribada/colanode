import { describe, expect, it } from 'vitest';

import { resolveWheelOwner, WheelContext } from './wheel';

const over = (overrides: Partial<WheelContext>): WheelContext => ({
  insideCardScroller: true,
  cardId: 'card-1',
  selectedIds: ['card-1'],
  zoomGesture: false,
  ...overrides,
});

describe('resolveWheelOwner', () => {
  it('lets the selected card scroll its own content', () => {
    expect(resolveWheelOwner(over({}))).toBe('card');
  });

  it('keeps the wheel for the card inside a wider selection', () => {
    expect(
      resolveWheelOwner(over({ selectedIds: ['shape-9', 'card-1'] }))
    ).toBe('card');
  });

  it('leaves an unselected card to the board, so zooming across cards is never trapped', () => {
    expect(resolveWheelOwner(over({ selectedIds: [] }))).toBe('board');
    expect(resolveWheelOwner(over({ selectedIds: ['card-2'] }))).toBe('board');
  });

  it('sends a zoom gesture to the board even over the selected card', () => {
    // Nothing zooms inside a page; letting it through would zoom the tab.
    expect(resolveWheelOwner(over({ zoomGesture: true }))).toBe('board');
  });

  it('gives the board anything outside a card body, the card header included', () => {
    expect(resolveWheelOwner(over({ insideCardScroller: false }))).toBe(
      'board'
    );
    expect(resolveWheelOwner(over({ cardId: null }))).toBe('board');
  });
});
