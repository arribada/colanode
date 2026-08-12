// Simple tidy tree layout for mind maps, in any of four directions. Each depth
// is a level; siblings stack alongside each other and every parent is centered
// on the span of its (expanded) children.
// (was: left-to-right only)
// siblings stack vertically and every parent is centered on the vertical span
// of its (expanded) children. Pure + testable — no board/DOM types.

export interface TidyNode {
  id: string;
  children: TidyNode[];
  collapsed?: boolean;
  /** optional per-node size; falls back to the layout defaults */
  w?: number;
  h?: number;
}

/** Which way the tree grows away from its root. */
export type TidyDirection = 'right' | 'left' | 'down' | 'up';

export interface TidyOptions {
  nodeW?: number;
  nodeH?: number;
  hGap?: number;
  vGap?: number;
  startX?: number;
  startY?: number;
  direction?: TidyDirection;
}

export interface TidyPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULTS: Required<TidyOptions> = {
  nodeW: 160,
  nodeH: 48,
  hGap: 56,
  vGap: 18,
  startX: 0,
  startY: 0,
  direction: 'right',
};

/** The one real layout: levels as columns, siblings stacked down the page. */
const layoutRightward = (
  root: TidyNode,
  opts: Required<TidyOptions>
): Record<string, TidyPosition> => {
  const positions: Record<string, TidyPosition> = {};
  let cursorY = opts.startY;

  const columnX = (depth: number): number =>
    opts.startX + depth * (opts.nodeW + opts.hGap);

  // Returns the vertical center of the node it laid out.
  const walk = (node: TidyNode, depth: number): number => {
    const w = node.w ?? opts.nodeW;
    const h = node.h ?? opts.nodeH;
    const x = columnX(depth);

    const expandedChildren = node.collapsed ? [] : node.children;

    if (expandedChildren.length === 0) {
      const y = cursorY;
      positions[node.id] = { x, y, w, h };
      cursorY += h + opts.vGap;
      return y + h / 2;
    }

    const childCenters = expandedChildren.map((child) =>
      walk(child, depth + 1)
    );
    const first = childCenters[0]!;
    const last = childCenters[childCenters.length - 1]!;
    const center = (first + last) / 2;
    positions[node.id] = { x, y: center - h / 2, w, h };
    return center;
  };

  walk(root, 0);
  return positions;
};

/** Same tree with every box turned a quarter turn. */
const rotateTree = (node: TidyNode): TidyNode => ({
  ...node,
  w: node.h,
  h: node.w,
  children: node.children.map(rotateTree),
});

/**
 * Compute top-left positions for every node in the tree. Collapsed nodes are
 * laid out as leaves (their subtrees are skipped). Guarantees non-overlapping
 * leaves and parents centered on their child span, in any direction.
 */
export const layoutTidyTree = (
  root: TidyNode,
  options: TidyOptions = {}
): Record<string, TidyPosition> => {
  const opts = { ...DEFAULTS, ...options };
  const vertical = opts.direction === 'down' || opts.direction === 'up';

  if (!vertical) {
    const laid = layoutRightward(root, opts);
    if (opts.direction === 'left') {
      mirrorX(laid, root.id);
    }
    return laid;
  }

  // Rotate in, lay out, rotate back: levels end up stacked down the page and
  // siblings spread across it, with no second algorithm to keep in sync.
  const rotated = layoutRightward(rotateTree(root), {
    ...opts,
    nodeW: opts.nodeH,
    nodeH: opts.nodeW,
    startX: opts.startY,
    startY: opts.startX,
  });
  const laid: Record<string, TidyPosition> = {};
  for (const [id, p] of Object.entries(rotated)) {
    laid[id] = { x: p.y, y: p.x, w: p.h, h: p.w };
  }
  if (opts.direction === 'up') {
    mirrorY(laid, root.id);
  }
  return laid;
};

/** Flip the layout about the root's center, so the root itself stays put. */
const mirrorX = (
  laid: Record<string, TidyPosition>,
  rootId: string
): void => {
  const root = laid[rootId];
  if (!root) {
    return;
  }
  const cx = root.x + root.w / 2;
  for (const p of Object.values(laid)) {
    p.x = 2 * cx - p.x - p.w;
  }
};

const mirrorY = (
  laid: Record<string, TidyPosition>,
  rootId: string
): void => {
  const root = laid[rootId];
  if (!root) {
    return;
  }
  const cy = root.y + root.h / 2;
  for (const p of Object.values(laid)) {
    p.y = 2 * cy - p.y - p.h;
  }
};
