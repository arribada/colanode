import { describe, expect, it } from 'vitest';

import { orderSiblings } from '@colanode/ui/lib/sibling-order';

const ids = (list: { id: string }[]) => list.map((n) => n.id);

describe('orderSiblings', () => {
  it('keeps id order when nothing was dragged', () => {
    const keys = new Map<string, string>();
    const list = orderSiblings([{ id: 'c' }, { id: 'a' }, { id: 'b' }], keys);
    expect(ids(list)).toEqual(['a', 'b', 'c']);
    expect([keys.get('a'), keys.get('b'), keys.get('c')]).toEqual([
      'a0',
      'a1',
      'a2',
    ]);
  });

  it("puts a dragged node at its own index, among the others' default keys", () => {
    const keys = new Map<string, string>();
    const list = orderSiblings(
      [{ id: 'a' }, { id: 'b' }, { id: 'c', index: 'a0V' }],
      keys
    );
    expect(ids(list)).toEqual(['a', 'c', 'b']);
    expect(keys.get('c')).toBe('a0V');
  });

  it('ignores an empty index', () => {
    const list = orderSiblings(
      [{ id: 'b' }, { id: 'a', index: '' }],
      new Map()
    );
    expect(ids(list)).toEqual(['a', 'b']);
  });

  it('compares keys by code unit, not by locale', () => {
    // 'Zz' sorts before 'a0' by code unit; a locale compare puts it after.
    const list = orderSiblings(
      [{ id: 'a' }, { id: 'b', index: 'Zz' }],
      new Map()
    );
    expect(ids(list)).toEqual(['b', 'a']);
  });
});
