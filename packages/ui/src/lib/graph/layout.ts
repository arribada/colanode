// ABOUTME: Deterministic force-directed layout for the knowledge graph — pure
// ABOUTME: maths, no dependency, no randomness, so the tests can actually bite.

export interface LayoutPoint {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface LayoutOptions {
  // Rest length of a spring between two connected nodes.
  linkDistance: number;
  // How hard every pair of nodes pushes each other apart.
  repulsion: number;
  // How hard a spring pulls its two ends together.
  springStrength: number;
  // Pull toward the origin, so a disconnected component cannot drift away.
  centerStrength: number;
  // Velocity retained between ticks. Below 1 the simulation settles.
  damping: number;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  linkDistance: 90,
  repulsion: 5200,
  springStrength: 0.045,
  centerStrength: 0.012,
  damping: 0.82,
};

// Two nodes landing on the exact same coordinates would divide by zero, and a
// random nudge would make the layout irreproducible. The golden angle spreads
// indices evenly and depends only on the position in the list.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MIN_DISTANCE = 1e-3;

export const seedPositions = (
  ids: readonly string[],
  spread = 40
): LayoutPoint[] =>
  ids.map((id, index) => {
    const angle = index * GOLDEN_ANGLE;
    const radius = spread * Math.sqrt(index + 0.5);
    return {
      id,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });

/**
 * Advances the simulation by one tick, in place. Returns the total distance
 * travelled, so a caller can stop once the graph has settled instead of burning
 * frames on a layout that no longer moves.
 */
export const stepLayout = (
  points: LayoutPoint[],
  edges: readonly LayoutEdge[],
  options: LayoutOptions = DEFAULT_LAYOUT_OPTIONS
): number => {
  const count = points.length;
  if (count === 0) {
    return 0;
  }

  const index = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    index.set(points[i]!.id, i);
  }

  const fx = new Float64Array(count);
  const fy = new Float64Array(count);

  // Repulsion, every pair. O(n^2) is fine at wiki scale and keeps the maths
  // simple enough to reason about; the caller hides orphans, which is what
  // actually bounds n.
  for (let i = 0; i < count; i++) {
    const a = points[i]!;
    for (let j = i + 1; j < count; j++) {
      const b = points[j]!;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let distSq = dx * dx + dy * dy;
      if (distSq < MIN_DISTANCE) {
        // Deterministic separation: derived from the indices, never random.
        dx = (i - j) * MIN_DISTANCE;
        dy = (i + j + 1) * MIN_DISTANCE;
        distSq = dx * dx + dy * dy;
      }
      const dist = Math.sqrt(distSq);
      const force = options.repulsion / distSq;
      const ux = dx / dist;
      const uy = dy / dist;
      fx[i]! += ux * force;
      fy[i]! += uy * force;
      fx[j]! -= ux * force;
      fy[j]! -= uy * force;
    }
  }

  // Springs along the edges.
  for (const edge of edges) {
    const i = index.get(edge.from);
    const j = index.get(edge.to);
    if (i === undefined || j === undefined || i === j) {
      continue;
    }
    const a = points[i]!;
    const b = points[j]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || MIN_DISTANCE;
    const force = (dist - options.linkDistance) * options.springStrength;
    const ux = dx / dist;
    const uy = dy / dist;
    fx[i]! += ux * force;
    fy[i]! += uy * force;
    fx[j]! -= ux * force;
    fy[j]! -= uy * force;
  }

  let travelled = 0;
  for (let i = 0; i < count; i++) {
    const p = points[i]!;
    const ax = fx[i]! - p.x * options.centerStrength;
    const ay = fy[i]! - p.y * options.centerStrength;
    p.vx = (p.vx + ax) * options.damping;
    p.vy = (p.vy + ay) * options.damping;
    p.x += p.vx;
    p.y += p.vy;
    travelled += Math.abs(p.vx) + Math.abs(p.vy);
  }

  return travelled;
};

export const runLayout = (
  points: LayoutPoint[],
  edges: readonly LayoutEdge[],
  ticks: number,
  options: LayoutOptions = DEFAULT_LAYOUT_OPTIONS
): number => {
  let travelled = 0;
  for (let i = 0; i < ticks; i++) {
    travelled = stepLayout(points, edges, options);
  }
  return travelled;
};

export interface LayoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const layoutBounds = (points: readonly LayoutPoint[]): LayoutBounds => {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
};

export const distance = (a: LayoutPoint, b: LayoutPoint): number =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
