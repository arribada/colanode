// ABOUTME: Decides who a wheel event over the board belongs to: the canvas (zoom
// ABOUTME: and pan) or the selected card whose own content should scroll.

export type WheelOwner = 'board' | 'card';

export interface WheelContext {
  /** The event started inside a card body that scrolls on its own. */
  insideCardScroller: boolean;
  /** The board element that card body belongs to, if any. */
  cardId: string | null;
  /** The board's current selection. */
  selectedIds: readonly string[];
  /** Ctrl or Cmd held: a trackpad pinch or a deliberate zoom. */
  zoomGesture: boolean;
}

/**
 * A card only takes the wheel once it is selected. Otherwise a board covered
 * in page cards would trap the pointer: every attempt to zoom or pan across it
 * would scroll whichever card happened to be under the cursor.
 *
 * A zoom gesture always goes to the board, even over the selected card: there
 * is nothing to zoom inside a page, and letting it through would zoom the
 * whole browser tab instead.
 */
export const resolveWheelOwner = (context: WheelContext): WheelOwner => {
  if (context.zoomGesture || !context.insideCardScroller || !context.cardId) {
    return 'board';
  }

  return context.selectedIds.includes(context.cardId) ? 'card' : 'board';
};
