import { describe, expect, it } from 'vitest';

import {
  closePane,
  collectLeaves,
  findLeaf,
  leafCount,
  resizeBranch,
  setLeafTab,
  singleLeaf,
  splitPane,
  type IdGen,
  type SplitBranch,
} from '@colanode/ui/lib/split-layout';

// Deterministic id generator so trees are easy to assert on.
const makeGen = (): IdGen => {
  let n = 0;
  return () => `id${++n}`;
};

describe('split-layout', () => {
  it('a single leaf holds one tab', () => {
    const root = singleLeaf('tabA', makeGen());
    expect(root.type).toBe('leaf');
    expect(collectLeaves(root).map((l) => l.tabId)).toEqual(['tabA']);
    expect(leafCount(root)).toBe(1);
  });

  it('splitting a leaf wraps it in a branch with the new pane after it', () => {
    const gen = makeGen();
    const root = singleLeaf('tabA', gen);
    const next = splitPane(root, root.id, 'tabB', 'horizontal', gen);
    expect(next.type).toBe('branch');
    const branch = next as SplitBranch;
    expect(branch.direction).toBe('horizontal');
    expect(collectLeaves(branch).map((l) => l.tabId)).toEqual(['tabA', 'tabB']);
    expect(branch.sizes).toEqual([1, 1]);
  });

  it('splitting before puts the new pane first', () => {
    const gen = makeGen();
    const root = singleLeaf('tabA', gen);
    const next = splitPane(root, root.id, 'tabB', 'vertical', gen, 'before');
    expect(collectLeaves(next).map((l) => l.tabId)).toEqual(['tabB', 'tabA']);
  });

  it('splitting again on the same axis extends the row instead of nesting', () => {
    const gen = makeGen();
    const root = singleLeaf('tabA', gen);
    const two = splitPane(root, root.id, 'tabB', 'horizontal', gen);
    const leaves = collectLeaves(two);
    const aId = leaves.find((l) => l.tabId === 'tabB')!.id;
    const three = splitPane(two, aId, 'tabC', 'horizontal', gen);
    // Still one branch, three children in a row — no nested wrapper.
    expect(three.type).toBe('branch');
    const branch = three as SplitBranch;
    expect(branch.children.every((c) => c.type === 'leaf')).toBe(true);
    expect(collectLeaves(branch).map((l) => l.tabId)).toEqual([
      'tabA',
      'tabB',
      'tabC',
    ]);
    expect(branch.sizes).toHaveLength(3);
  });

  it('splitting on the perpendicular axis nests a new branch (a grid)', () => {
    const gen = makeGen();
    const root = singleLeaf('tabA', gen);
    const row = splitPane(root, root.id, 'tabB', 'horizontal', gen);
    const bLeaf = collectLeaves(row).find((l) => l.tabId === 'tabB')!;
    const grid = splitPane(row, bLeaf.id, 'tabC', 'vertical', gen);
    // Root stays a horizontal row; tabB's cell became a vertical branch.
    expect(grid.type).toBe('branch');
    const branch = grid as SplitBranch;
    expect(branch.direction).toBe('horizontal');
    const nested = branch.children.find((c) => c.type === 'branch') as
      | SplitBranch
      | undefined;
    expect(nested?.direction).toBe('vertical');
    expect(collectLeaves(grid).map((l) => l.tabId).sort()).toEqual([
      'tabA',
      'tabB',
      'tabC',
    ]);
  });

  it('closing a pane collapses the redundant branch back to a leaf', () => {
    const gen = makeGen();
    const root = singleLeaf('tabA', gen);
    const two = splitPane(root, root.id, 'tabB', 'horizontal', gen);
    const bLeaf = collectLeaves(two).find((l) => l.tabId === 'tabB')!;
    const back = closePane(two, bLeaf.id);
    expect(back).not.toBeNull();
    expect(back!.type).toBe('leaf');
    expect(collectLeaves(back!).map((l) => l.tabId)).toEqual(['tabA']);
  });

  it('closing the only pane yields null', () => {
    const root = singleLeaf('tabA', makeGen());
    expect(closePane(root, root.id)).toBeNull();
  });

  it('closing one of three keeps a two-child branch', () => {
    const gen = makeGen();
    const root = singleLeaf('tabA', gen);
    const two = splitPane(root, root.id, 'tabB', 'horizontal', gen);
    const bId = collectLeaves(two).find((l) => l.tabId === 'tabB')!.id;
    const three = splitPane(two, bId, 'tabC', 'horizontal', gen);
    const cId = collectLeaves(three).find((l) => l.tabId === 'tabC')!.id;
    const after = closePane(three, cId)!;
    expect(after.type).toBe('branch');
    expect(collectLeaves(after).map((l) => l.tabId)).toEqual(['tabA', 'tabB']);
    expect((after as SplitBranch).sizes).toHaveLength(2);
  });

  it('resize trades weight between two neighbours and conserves their sum', () => {
    const gen = makeGen();
    const root = singleLeaf('tabA', gen);
    const two = splitPane(root, root.id, 'tabB', 'horizontal', gen) as SplitBranch;
    const resized = resizeBranch(two, two.id, 0, 0.25) as SplitBranch;
    expect(resized.sizes[0]! + resized.sizes[1]!).toBeCloseTo(2);
    expect(resized.sizes[0]).toBeCloseTo(1.5);
    expect(resized.sizes[1]).toBeCloseTo(0.5);
  });

  it('resize clamps so a pane never collapses to zero', () => {
    const gen = makeGen();
    const root = singleLeaf('tabA', gen);
    const two = splitPane(root, root.id, 'tabB', 'horizontal', gen) as SplitBranch;
    const resized = resizeBranch(two, two.id, 0, 5) as SplitBranch;
    expect(resized.sizes[1]).toBeGreaterThan(0);
    expect(resized.sizes[0]! + resized.sizes[1]!).toBeCloseTo(2);
  });

  it('setLeafTab repoints only the targeted pane', () => {
    const gen = makeGen();
    const root = singleLeaf('tabA', gen);
    const two = splitPane(root, root.id, 'tabB', 'horizontal', gen);
    const aLeaf = collectLeaves(two).find((l) => l.tabId === 'tabA')!;
    const updated = setLeafTab(two, aLeaf.id, 'tabZ');
    expect(collectLeaves(updated).map((l) => l.tabId)).toEqual(['tabZ', 'tabB']);
    expect(findLeaf(updated, aLeaf.id)!.tabId).toBe('tabZ');
  });
});
