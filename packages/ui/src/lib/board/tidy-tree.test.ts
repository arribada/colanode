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

describe('layout direction', () => {
  // one root, two children, fixed sizes so the numbers are checkable by hand
  const tree = {
    id: 'root',
    w: 100,
    h: 40,
    children: [
      { id: 'a', w: 100, h: 40, children: [] },
      { id: 'b', w: 100, h: 40, children: [] },
    ],
  };
  const opts = { nodeW: 100, nodeH: 40, hGap: 50, vGap: 10 };

  it('grows rightward by default', () => {
    const laid = layoutTidyTree(tree, opts);
    expect(laid.a!.x).toBeGreaterThan(laid.root!.x);
    expect(laid.b!.x).toBe(laid.a!.x);
    expect(laid.b!.y).toBeGreaterThan(laid.a!.y);
  });

  it('mirrors leftward around the root, leaving the root in place', () => {
    const right = layoutTidyTree(tree, opts);
    const left = layoutTidyTree(tree, { ...opts, direction: 'left' });
    expect(left.root).toEqual(right.root);
    expect(left.a!.x).toBeLessThan(left.root!.x);
    // same distance out, opposite side
    expect(right.a!.x - right.root!.x).toBe(left.root!.x - left.a!.x);
    // vertical stacking is untouched by the mirror
    expect(left.a!.y).toBe(right.a!.y);
  });

  it('stacks levels downward and siblings across', () => {
    const laid = layoutTidyTree(tree, { ...opts, direction: 'down' });
    expect(laid.a!.y).toBeGreaterThan(laid.root!.y);
    expect(laid.b!.y).toBe(laid.a!.y);
    expect(laid.b!.x).toBeGreaterThan(laid.a!.x);
    // boxes keep their real size through the rotation
    expect(laid.a!.w).toBe(100);
    expect(laid.a!.h).toBe(40);
  });

  it('siblings do not overlap in a downward tree', () => {
    const laid = layoutTidyTree(tree, { ...opts, direction: 'down' });
    expect(laid.b!.x).toBeGreaterThanOrEqual(laid.a!.x + laid.a!.w);
  });

  it('mirrors upward around the root, leaving the root in place', () => {
    const down = layoutTidyTree(tree, { ...opts, direction: 'down' });
    const up = layoutTidyTree(tree, { ...opts, direction: 'up' });
    expect(up.root).toEqual(down.root);
    expect(up.a!.y).toBeLessThan(up.root!.y);
    expect(down.a!.y - down.root!.y).toBe(up.root!.y - up.a!.y);
  });
});
