// Simple tidy left-to-right tree layout for mind maps. Each depth is a column;
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

export interface TidyOptions {
  nodeW?: number;
  nodeH?: number;
  hGap?: number;
  vGap?: number;
  startX?: number;
  startY?: number;
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
};

/**
 * Compute top-left positions for every node in the tree. Collapsed nodes are
 * laid out as leaves (their subtrees are skipped). Guarantees vertically
 * non-overlapping leaves and parents centered on their child span.
 */
export const layoutTidyTree = (
  root: TidyNode,
  options: TidyOptions = {}
): Record<string, TidyPosition> => {
  const opts = { ...DEFAULTS, ...options };
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
