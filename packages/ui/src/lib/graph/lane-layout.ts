// ABOUTME: Lane layout for the project graph — each lane a column of pages then
// ABOUTME: records sorted by name, wrapped into sub-columns. Pure, no simulation.
import type { LayoutPoint } from '@colanode/ui/lib/graph/layout';

export interface LaneLayoutNode {
  id: string;
  type: string;
  name: string;
  lane: string;
}

export interface LaneLayoutOptions {
  // Vertical distance between two nodes of a column.
  rowGap: number;
  // Horizontal distance between two sub-columns of the same lane, enough for
  // a truncated label.
  columnGap: number;
  // Empty space between two lanes.
  laneGap: number;
  // Rows before a lane wraps into another sub-column: 95 requirements make
  // five columns of nineteen, not one column two thousand units tall.
  maxRows: number;
}

export const DEFAULT_LANE_OPTIONS: LaneLayoutOptions = {
  rowGap: 28,
  columnGap: 170,
  laneGap: 140,
  maxRows: 22,
};

export interface LaneLayout {
  points: LayoutPoint[];
  // The x of each lane that holds at least one node, for its title.
  centers: Record<string, number>;
  // The y above the first row, for the titles.
  top: number;
}

const collator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

// Pages first (they are the lane's narrative), then records, each in name
// order with numbers compared as numbers: HW-2 before HW-10.
const compareNodes = (a: LaneLayoutNode, b: LaneLayoutNode): number => {
  const aRecord = a.type === 'record' ? 1 : 0;
  const bRecord = b.type === 'record' ? 1 : 0;
  return (
    aRecord - bRecord ||
    collator.compare(a.name, b.name) ||
    collator.compare(a.id, b.id)
  );
};

export const laneLayout = (
  nodes: readonly LaneLayoutNode[],
  laneOrder: readonly string[],
  options: LaneLayoutOptions = DEFAULT_LANE_OPTIONS
): LaneLayout => {
  const byLane = new Map<string, LaneLayoutNode[]>();
  for (const node of nodes) {
    const lane = laneOrder.includes(node.lane)
      ? node.lane
      : laneOrder[laneOrder.length - 1]!;
    const list = byLane.get(lane) ?? [];
    list.push(node);
    byLane.set(lane, list);
  }

  const placed: Array<{ id: string; x: number; y: number }> = [];
  const centers: Record<string, number> = {};
  let cursor = 0;
  let tallest = 0;
  for (const lane of laneOrder) {
    const list = (byLane.get(lane) ?? []).sort(compareNodes);
    if (list.length === 0) {
      continue;
    }
    const columns = Math.max(1, Math.ceil(list.length / options.maxRows));
    const rows = Math.ceil(list.length / columns);
    tallest = Math.max(tallest, rows);
    const width = (columns - 1) * options.columnGap;
    list.forEach((node, i) => {
      placed.push({
        id: node.id,
        x: cursor + Math.floor(i / rows) * options.columnGap,
        y: (i % rows) * options.rowGap,
      });
    });
    centers[lane] = cursor + width / 2;
    cursor += width + options.columnGap + options.laneGap;
  }

  // Centred on the origin, so the view frames it like any other graph.
  const span = Math.max(0, cursor - options.columnGap - options.laneGap);
  const dx = -span / 2;
  const dy = (-(tallest - 1) * options.rowGap) / 2;
  for (const lane of Object.keys(centers)) {
    centers[lane] = centers[lane]! + dx;
  }

  return {
    points: placed.map((p) => ({
      id: p.id,
      x: p.x + dx,
      y: p.y + dy,
      vx: 0,
      vy: 0,
    })),
    centers,
    top: dy - 44,
  };
};
