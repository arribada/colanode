import { describe, expect, it } from 'vitest';

import { generateFractionalIndex } from '@colanode/core';
import { orderSiblings } from '@colanode/server/lib/ai/tools';

// Ids in the shape of real node ids, sortable by their number.
const id = (n: number) => `01k${String(n).padStart(23, '0')}pg`;
const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

// The default keys the sidebar hands the first siblings, in id order.
const first = generateFractionalIndex(null, null);
const second = generateFractionalIndex(first, null);

describe('orderSiblings', () => {
  it('orders by id when nobody was dragged', () => {
    expect(
      ids(orderSiblings([{ id: id(3) }, { id: id(1) }, { id: id(2) }]))
    ).toEqual([id(1), id(2), id(3)]);
  });

  it("lets a dragged node's own index override its default slot", () => {
    const between = generateFractionalIndex(first, second);
    expect(
      ids(
        orderSiblings([
          { id: id(1) },
          { id: id(2) },
          { id: id(3), index: between },
        ])
      )
    ).toEqual([id(1), id(3), id(2)]);
  });

  it('puts a node dragged above the first one at the top', () => {
    expect(
      ids(
        orderSiblings([
          { id: id(1) },
          { id: id(2), index: generateFractionalIndex(null, first) },
        ])
      )
    ).toEqual([id(2), id(1)]);
  });

  it('keeps id order when a custom index equals a default key', () => {
    // id(3) claims the key id(1) holds by default; the sort is stable, so the
    // lower id stays ahead, exactly as in the sidebar.
    expect(
      ids(
        orderSiblings([
          { id: id(3), index: first },
          { id: id(2) },
          { id: id(1) },
        ])
      )
    ).toEqual([id(1), id(3), id(2)]);
  });

  it('treats an empty or missing index as no index', () => {
    expect(
      ids(
        orderSiblings([
          { id: id(2), index: '' },
          { id: id(1), index: null },
        ])
      )
    ).toEqual([id(1), id(2)]);
  });

  it('counts every sibling when handing out default keys', () => {
    // A custom key between the second and third defaults lands after the
    // second sibling -- which it would not if the defaults skipped anyone.
    const third = generateFractionalIndex(second, null);
    expect(
      ids(
        orderSiblings([
          { id: id(1) },
          { id: id(2) },
          { id: id(3) },
          { id: id(4), index: generateFractionalIndex(second, third) },
        ])
      )
    ).toEqual([id(1), id(2), id(4), id(3)]);
  });
});
