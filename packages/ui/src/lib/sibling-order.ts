// ABOUTME: The order siblings take in the sidebar, shared by every view that
// ABOUTME: must list pages the way the user arranged them (sidebar, PDF export).
import { compareString, generateFractionalIndex } from '@colanode/core';

// Every node type the sidebar knows how to draw. Anything else (files, records,
// messages) never appears in the tree, so it never takes part in the order.
export const SIDEBAR_NODE_TYPES = [
  'space',
  'channel',
  'chat',
  'page',
  'database',
  'database_view',
  'folder',
  'whiteboard',
];

export const isSidebarNodeType = (type: string): boolean =>
  SIDEBAR_NODE_TYPES.includes(type);

const customIndexOf = (node: { id: string }): string | null =>
  'index' in node && typeof node.index === 'string' && node.index.length > 0
    ? node.index
    : null;

// Ordering model (mirrors space-child-reorder): within one parent, sort by id,
// hand each sibling a sequential *default* fractional key, then let a node's
// own `index` (written when it was dragged) override that key. Sorting by the
// effective key gives a stable, user-defined order without ever having to
// backfill an index onto the siblings that weren't moved.
//
// The default keys depend on the WHOLE sibling group: a dragged page's index
// was computed between the keys of its neighbours of every type. Ordering only
// the pages of a group numbers the defaults differently and puts the dragged
// ones back in the wrong place.
//
// Sorts `siblings` in place, records each one's effective key in `keyById`, and
// returns the array.
export const orderSiblings = <T extends { id: string }>(
  siblings: T[],
  keyById: Map<string, string>
): T[] => {
  siblings.sort((a, b) => compareString(a.id, b.id));
  let lastDefault: string | null = null;
  for (const sibling of siblings) {
    lastDefault = generateFractionalIndex(lastDefault, null);
    keyById.set(sibling.id, customIndexOf(sibling) ?? lastDefault);
  }
  return siblings.sort((a, b) =>
    compareString(keyById.get(a.id) ?? a.id, keyById.get(b.id) ?? b.id)
  );
};
