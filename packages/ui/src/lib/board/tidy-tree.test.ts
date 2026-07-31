import { describe, expect, it } from 'vitest';

import {
  layoutTidyTree,
  TidyNode,
} from '@colanode/ui/lib/board/tidy-tree';

const opts = {
  nodeW: 100,
  nodeH: 40,
  hGap: 50,
  vGap: 10,
  startX: 0,
  startY: 0,
};

describe('layoutTidyTree', () => {
  it('places a lone root at the origin', () => {
    const root: TidyNode = { id: 'root', children: [] };
    const pos = layoutTidyTree(root, opts);
    expect(pos.root).toEqual({ x: 0, y: 0, w: 100, h: 40 });
  });

  it('assigns columns by depth (left-to-right)', () => {
    const root: TidyNode = {
      id: 'a',
      children: [{ id: 'b', children: [{ id: 'c', children: [] }] }],
    };
    const pos = layoutTidyTree(root, opts);
    expect(pos.a!.x).toBe(0);
    expect(pos.b!.x).toBe(150);
    expect(pos.c!.x).toBe(300);
  });

  it('centers a parent on its children span', () => {
    const root: TidyNode = {
      id: 'r',
      children: [
        { id: 'c1', children: [] },
        { id: 'c2', children: [] },
        { id: 'c3', children: [] },
      ],
    };
    const pos = layoutTidyTree(root, opts);
    // children stacked: centers at 20, 70, 120 -> parent center 70 -> y 50
    expect(pos.c1!.y).toBe(0);
    expect(pos.c2!.y).toBe(50);
    expect(pos.c3!.y).toBe(100);
    expect(pos.r!.y).toBe(50);
  });

  it('produces non-overlapping leaf rows', () => {
    const root: TidyNode = {
      id: 'r',
      children: [
        { id: 'a', children: [{ id: 'a1', children: [] }, { id: 'a2', children: [] }] },
        { id: 'b', children: [{ id: 'b1', children: [] }] },
      ],
    };
    const pos = layoutTidyTree(root, opts);
    const leaves = ['a1', 'a2', 'b1']
      .map((id) => pos[id]!)
      .sort((p, q) => p.y - q.y);
    for (let i = 1; i < leaves.length; i++) {
      expect(leaves[i]!.y).toBeGreaterThanOrEqual(
        leaves[i - 1]!.y + leaves[i - 1]!.h
      );
    }
  });

  it('treats collapsed nodes as leaves', () => {
    const root: TidyNode = {
      id: 'r',
      collapsed: true,
      children: [{ id: 'hidden', children: [] }],
    };
    const pos = layoutTidyTree(root, opts);
    expect(pos.r).toBeDefined();
    expect(pos.hidden).toBeUndefined();
  });
});
