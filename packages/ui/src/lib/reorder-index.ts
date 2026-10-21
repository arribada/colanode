// ABOUTME: Reordering a list kept by fractional index -- select options, view tabs,
// ABOUTME: properties: the list in its order, and the indexes a drag has to write.
import { compareString, generateFractionalIndex } from '@colanode/core';

export interface Indexed {
  id: string;
  index: string;
}

export type ReorderEdge = 'before' | 'after';

// In the order the reader arranged them. The id settles a tie, so two items
// sharing an index (an import can make them) still keep one stable order.
export const sortByIndex = <T extends Indexed>(items: Iterable<T>): T[] =>
  [...items].sort(
    (a, b) => compareString(a.index, b.index) || compareString(a.id, b.id)
  );

// The indexes to write so `draggedId` sits just before or after `targetId`
// (or last, with null): usually one, for the dragged item. When its new
// neighbours leave no key between them -- they share an index -- the whole
// list is renumbered in its new order instead.
export const reorderByIndex = (
  items: Iterable<Indexed>,
  draggedId: string,
  targetId: string | null,
  edge: ReorderEdge
): Record<string, string> => {
  const sorted = sortByIndex(items);
  const dragged = sorted.find((item) => item.id === draggedId);
  if (!dragged || draggedId === targetId) {
    return {};
  }

  const rest = sorted.filter((item) => item.id !== draggedId);
  const at = targetId === null ? -1 : rest.findIndex((i) => i.id === targetId);
  const slot = at < 0 ? rest.length : edge === 'before' ? at : at + 1;
  const before = rest[slot - 1];
  const after = rest[slot];

  if (sorted.indexOf(dragged) === slot) {
    // Dropped where it already was.
    return {};
  }

  try {
    return {
      [draggedId]: generateFractionalIndex(
        before?.index ?? null,
        after?.index ?? null
      ),
    };
  } catch {
    const order = [...rest.slice(0, slot), dragged, ...rest.slice(slot)];
    const indexes: Record<string, string> = {};
    let previous: string | null = null;
    for (const item of order) {
      previous = generateFractionalIndex(previous, null);
      indexes[item.id] = previous;
    }
    return indexes;
  }
};
