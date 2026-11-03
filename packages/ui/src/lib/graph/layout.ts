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
 * Lays out the next graph from where the previous one stopped. A node already
 * on screen keeps its place, so changing a filter or the depth reads as the
 * graph growing or shrinking instead of being thrown away and redrawn from the
 * seed spiral, which is what made every click look like a glitch. A new node
 * starts beside the neighbours it already has on screen; only one with no drawn
 * neighbour at all goes on a ring outside the picture.
 */
export const carryPositions = (
  previous: readonly LayoutPoint[],
  ids: readonly string[],
  edges: readonly LayoutEdge[],
  spread = 40
): LayoutPoint[] => {
  const before = new Map<string, LayoutPoint>();
  for (const point of previous) {
    before.set(point.id, point);
  }
  if (!ids.some((id) => before.has(id))) {
    return seedPositions(ids, spread);
  }

  const order = new Map<string, number>();
  ids.forEach((id, index) => order.set(id, index));

  const neighbours = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = neighbours.get(a);
    if (list) {
      list.push(b);
    } else {
      neighbours.set(a, [b]);
    }
  };
  for (const edge of edges) {
    if (edge.from !== edge.to && order.has(edge.from) && order.has(edge.to)) {
      link(edge.from, edge.to);
      link(edge.to, edge.from);
    }
  }

  // Momentum is dropped: a node coasting from the last layout would carry a
  // motion that no longer has a cause.
  const placed = new Map<string, LayoutPoint>();
  for (const id of ids) {
    const point = before.get(id);
    if (point) {
      placed.set(id, { id, x: point.x, y: point.y, vx: 0, vy: 0 });
    }
  }

  // In waves: first the new nodes touching a drawn one, then those touching
  // the first wave, so a chain of new pages unrolls outward instead of piling
  // up. A wave only anchors on earlier waves, which keeps the result
  // independent of the order the ids come in.
  let pending = ids.filter((id) => !placed.has(id));
  while (pending.length > 0) {
    const wave: LayoutPoint[] = [];
    const rest: string[] = [];
    for (const id of pending) {
      let sumX = 0;
      let sumY = 0;
      let anchors = 0;
      for (const other of neighbours.get(id) ?? []) {
        const anchor = placed.get(other);
        if (anchor) {
          sumX += anchor.x;
          sumY += anchor.y;
          anchors++;
        }
      }
      if (anchors === 0) {
        rest.push(id);
        continue;
      }
      const angle = order.get(id)! * GOLDEN_ANGLE;
      wave.push({
        id,
        x: sumX / anchors + Math.cos(angle) * spread,
        y: sumY / anchors + Math.sin(angle) * spread,
        vx: 0,
        vy: 0,
      });
    }
    if (wave.length === 0) {
      break;
    }
    for (const point of wave) {
      placed.set(point.id, point);
    }
    pending = rest;
  }

  if (pending.length > 0) {
    let reach = 0;
    for (const point of placed.values()) {
      reach = Math.max(reach, Math.hypot(point.x, point.y));
    }
    pending.forEach((id, index) => {
      const angle = order.get(id)! * GOLDEN_ANGLE;
      const radius = reach + spread * Math.sqrt(index + 1);
      placed.set(id, {
        id,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      });
    });
  }

  return ids.map((id) => placed.get(id)!);
};

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

// Pan and zoom of the scene, in viewport units, the viewport origin being its
// centre (the graph's viewBox is centred on 0,0).
export interface ViewTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface FitOptions {
  // Room kept free on every side of the viewport, for labels and breathing.
  padding: number;
  minZoom: number;
  maxZoom: number;
}

export const DEFAULT_FIT_OPTIONS: FitOptions = {
  padding: 48,
  minZoom: 0.12,
  maxZoom: 1,
};

/**
 * The view that frames `bounds` in a `width` x `height` viewport. `maxZoom`
 * caps it so a three-node graph is recentred rather than blown up to fill the
 * pane.
 */
export const fitView = (
  bounds: LayoutBounds,
  width: number,
  height: number,
  options: FitOptions = DEFAULT_FIT_OPTIONS
): ViewTransform => {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const roomX = Math.max(1, width - 2 * options.padding);
  const roomY = Math.max(1, height - 2 * options.padding);
  const zoom = Math.min(
    options.maxZoom,
    Math.max(options.minZoom, Math.min(roomX / spanX, roomY / spanY))
  );
  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreY = (bounds.minY + bounds.maxY) / 2;
  return { x: -centreX * zoom, y: -centreY * zoom, zoom };
};

/**
 * Zooms by `factor` around the viewport point (`pointX`, `pointY`), so what is
 * under the cursor stays under the cursor.
 */
export const zoomAt = (
  view: ViewTransform,
  factor: number,
  pointX: number,
  pointY: number,
  minZoom = DEFAULT_FIT_OPTIONS.minZoom,
  maxZoom = 4
): ViewTransform => {
  const zoom = Math.min(maxZoom, Math.max(minZoom, view.zoom * factor));
  const ratio = zoom / view.zoom;
  return {
    x: pointX - (pointX - view.x) * ratio,
    y: pointY - (pointY - view.y) * ratio,
    zoom,
  };
};
