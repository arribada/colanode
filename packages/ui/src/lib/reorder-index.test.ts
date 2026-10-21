import { describe, expect, it } from 'vitest';

import { generateFractionalIndex } from '@colanode/core';
import {
  Indexed,
  reorderByIndex,
  sortByIndex,
} from '@colanode/ui/lib/reorder-index';

const keys = (count: number): string[] => {
  const out: string[] = [];
  let previous: string | null = null;
  for (let i = 0; i < count; i++) {
    previous = generateFractionalIndex(previous, null);
    out.push(previous);
  }
  return out;
};

const [k0, k1, k2, k3] = keys(4) as [string, string, string, string];
const items: Indexed[] = [
  { id: 'todo', index: k0 },
  { id: 'doing', index: k1 },
  { id: 'review', index: k2 },
  { id: 'done', index: k3 },
];

// Apply the written indexes and read the list back in order.
const after = (written: Record<string, string>, list = items) =>
  sortByIndex(
    list.map((item) => ({ ...item, index: written[item.id] ?? item.index }))
  ).map((item) => item.id);

describe('sortByIndex', () => {
  it('orders by index, not by how they were stored', () => {
    expect(
      sortByIndex([items[2]!, items[0]!, items[3]!, items[1]!]).map((i) => i.id)
    ).toEqual(['todo', 'doing', 'review', 'done']);
  });

  it('orders by code unit: an upper-case index comes before a lower-case one', () => {
    const list = [
      { id: 'b', index: 'a0' },
      { id: 'a', index: 'Zz' },
    ];
    expect(sortByIndex(list).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('keeps a stable order for items sharing an index', () => {
    const list = [
      { id: 'y', index: 'a0' },
      { id: 'x', index: 'a0' },
    ];
    expect(sortByIndex(list).map((i) => i.id)).toEqual(['x', 'y']);
  });
});

describe('reorderByIndex', () => {
  it('moves an item before another, writing only its own index', () => {
    const written = reorderByIndex(items, 'done', 'doing', 'before');
    expect(Object.keys(written)).toEqual(['done']);
    expect(after(written)).toEqual(['todo', 'done', 'doing', 'review']);
  });

  it('moves an item after another', () => {
    expect(after(reorderByIndex(items, 'todo', 'review', 'after'))).toEqual([
      'doing',
      'review',
      'todo',
      'done',
    ]);
  });

  it('moves an item first and last', () => {
    expect(after(reorderByIndex(items, 'review', 'todo', 'before'))).toEqual([
      'review',
      'todo',
      'doing',
      'done',
    ]);
    expect(after(reorderByIndex(items, 'doing', null, 'after'))).toEqual([
      'todo',
      'review',
      'done',
      'doing',
    ]);
  });

  it('writes nothing for a drop on itself or where it already is', () => {
    expect(reorderByIndex(items, 'doing', 'doing', 'before')).toEqual({});
    expect(reorderByIndex(items, 'doing', 'review', 'before')).toEqual({});
    expect(reorderByIndex(items, 'doing', 'todo', 'after')).toEqual({});
    expect(reorderByIndex(items, 'missing', 'todo', 'after')).toEqual({});
  });

  it('renumbers the list when the new neighbours share an index', () => {
    const tied: Indexed[] = [
      { id: 'a', index: 'a0' },
      { id: 'b', index: 'a1' },
      { id: 'c', index: 'a1' },
    ];
    const written = reorderByIndex(tied, 'a', 'b', 'after');
    expect(after(written, tied)).toEqual(['b', 'a', 'c']);
    expect(new Set(Object.values(written)).size).toBe(3);
  });
});
