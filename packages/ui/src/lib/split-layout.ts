// ABOUTME: Pure split-layout tree operations for the local-only, VS Code-style
// ABOUTME: multi-pane view — split / close / resize / focus, no React, no I/O.

export type SplitDirection = 'horizontal' | 'vertical';

// A leaf shows one tab (by id) in a pane. tabId is the only link to the
// persisted tab world; everything else here is local, in-memory view state.
export interface SplitLeaf {
  type: 'leaf';
  id: string;
  tabId: string;
}

// A branch lays its children out along `direction`; `sizes` are flex-grow
// weights (one per child) that the resizer trades between neighbours.
export interface SplitBranch {
  type: 'branch';
  id: string;
  direction: SplitDirection;
  children: SplitNode[];
  sizes: number[];
}

export type SplitNode = SplitLeaf | SplitBranch;

export type IdGen = () => string;

// The perpendicular axis: splitting a pane "horizontal" places the new pane
// beside it in a row (side by side); "vertical" stacks it below.
const axisOf = (direction: SplitDirection): SplitDirection => direction;

export const singleLeaf = (tabId: string, genId: IdGen): SplitLeaf => ({
  type: 'leaf',
  id: genId(),
  tabId,
});

export const collectLeaves = (node: SplitNode): SplitLeaf[] => {
  if (node.type === 'leaf') {
    return [node];
  }
  return node.children.flatMap(collectLeaves);
};

export const findLeaf = (
  node: SplitNode,
  leafId: string
): SplitLeaf | null => {
  if (node.type === 'leaf') {
    return node.id === leafId ? node : null;
  }
  for (const child of node.children) {
    const found = findLeaf(child, leafId);
    if (found) {
      return found;
    }
  }
  return null;
};

export const leafCount = (node: SplitNode): number =>
  collectLeaves(node).length;

// Split the pane `targetLeafId` along `direction`, inserting a new leaf for
// `newTabId` on the requested side. If the target's parent already lays out
// along the same axis, we extend that branch instead of nesting a new one, so
// N sequential splits in one direction give N evenly-weighted siblings (a row
// or column) rather than a lopsided binary staircase.
export const splitPane = (
  root: SplitNode,
  targetLeafId: string,
  newTabId: string,
  direction: SplitDirection,
  genId: IdGen,
  side: 'before' | 'after' = 'after'
): SplitNode => {
  const newLeaf: SplitLeaf = { type: 'leaf', id: genId(), tabId: newTabId };

  const rebuild = (
    node: SplitNode,
    parent: SplitBranch | null
  ): SplitNode => {
    if (node.type === 'leaf') {
      if (node.id !== targetLeafId) {
        return node;
      }
      // Extend the parent branch when it shares our axis (handled by the
      // branch case below); otherwise wrap the target in a fresh branch.
      if (parent && parent.direction === axisOf(direction)) {
        return node; // parent will splice the new leaf in around it
      }
      const children =
        side === 'after' ? [node, newLeaf] : [newLeaf, node];
      return {
        type: 'branch',
        id: genId(),
        direction: axisOf(direction),
        children,
        sizes: [1, 1],
      };
    }

    // Branch: if a direct child is the target AND this branch shares the axis,
    // splice the new leaf next to it here (the "extend the row" path).
    if (node.direction === axisOf(direction)) {
      const idx = node.children.findIndex(
        (c) => c.type === 'leaf' && c.id === targetLeafId
      );
      if (idx >= 0) {
        const at = side === 'after' ? idx + 1 : idx;
        const children = [...node.children];
        children.splice(at, 0, newLeaf);
        const sizes = [...node.sizes];
        // New pane takes the average weight so the layout stays balanced.
        const avg =
          sizes.reduce((a, b) => a + b, 0) / (sizes.length || 1) || 1;
        sizes.splice(at, 0, avg);
        return { ...node, children, sizes };
      }
    }

    return {
      ...node,
      children: node.children.map((c) => rebuild(c, node)),
    };
  };

  return rebuild(root, null);
};

// Remove a pane; collapse any branch left with a single child so the tree never
// keeps a redundant wrapper. Returns null if the last pane was removed.
export const closePane = (
  root: SplitNode,
  leafId: string
): SplitNode | null => {
  const prune = (node: SplitNode): SplitNode | null => {
    if (node.type === 'leaf') {
      return node.id === leafId ? null : node;
    }
    const kept: SplitNode[] = [];
    const keptSizes: number[] = [];
    node.children.forEach((child, i) => {
      const pruned = prune(child);
      if (pruned) {
        kept.push(pruned);
        keptSizes.push(node.sizes[i] ?? 1);
      }
    });
    if (kept.length === 0) {
      return null;
    }
    if (kept.length === 1) {
      return kept[0]!;
    }
    return { ...node, children: kept, sizes: keptSizes };
  };

  return prune(root);
};

// Trade weight between children `index` and `index+1` of the branch `branchId`.
// `delta` is a fraction of the branch's total weight; neighbours stay clamped to
// a small minimum so a pane can never be resized to zero.
export const resizeBranch = (
  root: SplitNode,
  branchId: string,
  index: number,
  delta: number
): SplitNode => {
  const MIN = 0.05;
  const apply = (node: SplitNode): SplitNode => {
    if (node.type === 'leaf') {
      return node;
    }
    if (node.id === branchId) {
      const sizes = [...node.sizes];
      const a = sizes[index];
      const b = sizes[index + 1];
      if (a === undefined || b === undefined) {
        return node;
      }
      const total = a + b;
      let na = a + delta * total;
      let nb = b - delta * total;
      const min = total * MIN;
      if (na < min) {
        na = min;
        nb = total - min;
      }
      if (nb < min) {
        nb = min;
        na = total - min;
      }
      sizes[index] = na;
      sizes[index + 1] = nb;
      return { ...node, sizes };
    }
    return { ...node, children: node.children.map(apply) };
  };
  return apply(root);
};

// Point a leaf at a different tab (used when the tab bar switches the tab shown
// in the focused pane, or when a tab is closed and its pane must follow).
export const setLeafTab = (
  root: SplitNode,
  leafId: string,
  tabId: string
): SplitNode => {
  const apply = (node: SplitNode): SplitNode => {
    if (node.type === 'leaf') {
      return node.id === leafId ? { ...node, tabId } : node;
    }
    return { ...node, children: node.children.map(apply) };
  };
  return apply(root);
};
