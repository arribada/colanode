// Mind-map helpers: read the mindmap forest out of a board scene, grow it with
// Tab (child) / Enter (sibling), keep each tree tidily laid out left-to-right
// with its root anchored in place, resolve collapsed-hidden descendants, and
// list parent→child edges. Pure — no React / DOM — so the tree + layout logic
// is unit-testable.

import { BoardElement, BoardScene } from '@colanode/core';
import { createElement, topZ } from '@colanode/ui/lib/board/elements';
import { Point } from '@colanode/ui/lib/board/geometry';
import {
  layoutTidyTree,
  TidyDirection,
  TidyNode,
} from '@colanode/ui/lib/board/tidy-tree';

export type MindmapDirection = TidyDirection;

export const MINDMAP_H_GAP = 80;
export const MINDMAP_V_GAP = 24;

const isMindmap = (el: BoardElement | undefined): el is BoardElement =>
  !!el && el.type === 'mindmap';

/** Direct mindmap children of `id`, ordered back-to-front by z. */
export const mindmapChildren = (
  scene: BoardScene,
  id: string
): BoardElement[] =>
  Object.values(scene)
    .filter((el) => isMindmap(el) && el.mindmap?.parentId === id)
    .sort((a, b) => (a.z < b.z ? -1 : a.z > b.z ? 1 : 0));

/** True when the element is a mindmap node with no mindmap parent in scene. */
export const isMindmapRoot = (scene: BoardScene, el: BoardElement): boolean => {
  if (!isMindmap(el)) {
    return false;
  }
  const parentId = el.mindmap?.parentId;
  return !parentId || !isMindmap(scene[parentId]);
};

/** Walk up the parent chain to the root id of the tree containing `id`. */
export const mindmapRootOf = (scene: BoardScene, id: string): string => {
  let cur = scene[id];
  let guard = 0;
  while (
    cur &&
    cur.mindmap?.parentId &&
    isMindmap(scene[cur.mindmap.parentId]) &&
    guard++ < 100000
  ) {
    cur = scene[cur.mindmap.parentId]!;
  }
  return cur?.id ?? id;
};

const buildTidyNode = (scene: BoardScene, el: BoardElement): TidyNode => ({
  id: el.id,
  w: el.w,
  h: el.h,
  collapsed: el.mindmap?.collapsed,
  children: mindmapChildren(scene, el.id).map((child) =>
    buildTidyNode(scene, child)
  ),
});

/** Build the TidyNode tree rooted at `rootId` (for layout / inspection). */
export const buildMindmapTree = (
  scene: BoardScene,
  rootId: string
): TidyNode | null => {
  const root = scene[rootId];
  if (!isMindmap(root)) {
    return null;
  }
  return buildTidyNode(scene, root);
};

/** Which way the tree containing `anyId` grows. Defaults to rightward. */
export const mindmapDirection = (
  scene: BoardScene,
  anyId: string
): MindmapDirection => {
  const root = scene[mindmapRootOf(scene, anyId)];
  return root?.mindmap?.direction ?? 'right';
};

export interface MindmapEdit {
  scene: BoardScene;
  changedIds: string[];
}

/**
 * Re-run the tidy layout for the tree that contains `anyId`, keeping its root
 * anchored at its current position. Returns the updated scene plus the ids of
 * every element that moved.
 */
export const relayoutMindmap = (
  scene: BoardScene,
  anyId: string
): MindmapEdit => {
  const rootId = mindmapRootOf(scene, anyId);
  const root = scene[rootId];
  const tree = buildMindmapTree(scene, rootId);
  if (!root || !tree) {
    return { scene, changedIds: [] };
  }
  const pos = layoutTidyTree(tree, {
    hGap: MINDMAP_H_GAP,
    vGap: MINDMAP_V_GAP,
    startX: root.x,
    startY: root.y,
    // The direction belongs to the tree, so it is read off the root — a child
    // pointing a different way would tear the layout in half.
    direction: mindmapDirection(scene, rootId),
  });
  const laidRoot = pos[rootId];
  if (!laidRoot) {
    return { scene, changedIds: [] };
  }
  // keep the root visually fixed by translating the whole tree
  const dx = root.x - laidRoot.x;
  const dy = root.y - laidRoot.y;
  const next: BoardScene = { ...scene };
  const changedIds: string[] = [];
  for (const [id, p] of Object.entries(pos)) {
    const el = next[id];
    if (!el) {
      continue;
    }
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (el.x !== nx || el.y !== ny) {
      next[id] = { ...el, x: nx, y: ny };
      changedIds.push(id);
    }
  }
  return { scene: next, changedIds };
};

export interface MindmapAdd extends MindmapEdit {
  newId: string;
}

const newMindmapNode = (
  scene: BoardScene,
  parentId: string | undefined,
  x: number,
  y: number
): BoardElement => {
  const node = createElement({
    type: 'mindmap',
    x,
    y,
    z: topZ(scene),
    text: '',
  });
  node.mindmap = parentId ? { parentId } : {};
  return node;
};

/** Add a child under `parentId`, expand the parent if collapsed, relayout. */
export const addMindmapChild = (
  scene: BoardScene,
  parentId: string
): MindmapAdd | null => {
  const parent = scene[parentId];
  if (!isMindmap(parent)) {
    return null;
  }
  const child = newMindmapNode(
    scene,
    parentId,
    parent.x + parent.w + MINDMAP_H_GAP,
    parent.y
  );
  const next: BoardScene = { ...scene, [child.id]: child };
  const touched = new Set<string>([child.id]);
  if (parent.mindmap?.collapsed) {
    next[parentId] = {
      ...parent,
      mindmap: { ...parent.mindmap, collapsed: false },
    };
    touched.add(parentId);
  }
  const relaid = relayoutMindmap(next, child.id);
  relaid.changedIds.forEach((id) => touched.add(id));
  return { scene: relaid.scene, newId: child.id, changedIds: [...touched] };
};

/**
 * Add a sibling of `id`. A non-root node gets a new child under the same
 * parent; a root node spawns a fresh root placed just below it.
 */
export const addMindmapSibling = (
  scene: BoardScene,
  id: string
): MindmapAdd | null => {
  const el = scene[id];
  if (!isMindmap(el)) {
    return null;
  }
  const parentId = el.mindmap?.parentId;
  if (parentId && isMindmap(scene[parentId])) {
    return addMindmapChild(scene, parentId);
  }
  // root: drop a new root below without disturbing the existing tree
  const sibling = newMindmapNode(scene, undefined, el.x, el.y + el.h + MINDMAP_V_GAP);
  return {
    scene: { ...scene, [sibling.id]: sibling },
    newId: sibling.id,
    changedIds: [sibling.id],
  };
};

/** Toggle the collapsed flag on a node and relayout its tree. */
export const toggleMindmapCollapsed = (
  scene: BoardScene,
  id: string
): MindmapEdit => {
  const el = scene[id];
  if (!isMindmap(el)) {
    return { scene, changedIds: [] };
  }
  const collapsed = !el.mindmap?.collapsed;
  const next: BoardScene = {
    ...scene,
    [id]: { ...el, mindmap: { ...el.mindmap, collapsed } },
  };
  const relaid = relayoutMindmap(next, id);
  return {
    scene: relaid.scene,
    changedIds: [...new Set([id, ...relaid.changedIds])],
  };
};

/** Ids hidden because a mindmap ancestor is collapsed. */
export const mindmapHiddenIds = (scene: BoardScene): Set<string> => {
  const hidden = new Set<string>();
  const hide = (id: string) => {
    for (const child of mindmapChildren(scene, id)) {
      if (!hidden.has(child.id)) {
        hidden.add(child.id);
        hide(child.id);
      }
    }
  };
  for (const el of Object.values(scene)) {
    if (isMindmap(el) && el.mindmap?.collapsed) {
      hide(el.id);
    }
  }
  return hidden;
};

export interface MindmapEdge {
  id: string;
  from: BoardElement;
  to: BoardElement;
}

/** Parent→child edges to draw, skipping any endpoint hidden by a collapse. */
export const mindmapEdges = (scene: BoardScene): MindmapEdge[] => {
  const hidden = mindmapHiddenIds(scene);
  const edges: MindmapEdge[] = [];
  for (const el of Object.values(scene)) {
    if (!isMindmap(el)) {
      continue;
    }
    const parentId = el.mindmap?.parentId;
    if (!parentId) {
      continue;
    }
    const parent = scene[parentId];
    if (!isMindmap(parent)) {
      continue;
    }
    if (hidden.has(el.id) || hidden.has(parent.id)) {
      continue;
    }
    edges.push({ id: `${parent.id}->${el.id}`, from: parent, to: el });
  }
  return edges;
};

/** True when the node has at least one mindmap child (collapse target). */
export const hasMindmapChildren = (scene: BoardScene, id: string): boolean =>
  mindmapChildren(scene, id).length > 0;

/** Point the whole tree containing `anyId` in a new direction and relayout. */
export const setMindmapDirection = (
  scene: BoardScene,
  anyId: string,
  direction: MindmapDirection
): MindmapEdit => {
  const rootId = mindmapRootOf(scene, anyId);
  const root = scene[rootId];
  if (!isMindmap(root)) {
    return { scene, changedIds: [] };
  }
  const next: BoardScene = {
    ...scene,
    [rootId]: { ...root, mindmap: { ...root.mindmap, direction } },
  };
  const relaid = relayoutMindmap(next, rootId);
  return {
    scene: relaid.scene,
    changedIds: [...new Set([rootId, ...relaid.changedIds])],
  };
};

export interface MindmapEdgeGeometry {
  from: Point;
  to: Point;
  c1: Point;
  c2: Point;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where a parent→child edge leaves and lands, plus its bezier controls.
 *
 * Derived from the boxes' relative position rather than the tree's declared
 * direction: that way the edge stays attached to the right sides after a node
 * is dragged off the tidy layout by hand, which the declared direction cannot
 * know about.
 */
export const mindmapEdgeGeometry = (
  parent: Box,
  child: Box
): MindmapEdgeGeometry => {
  const pc = { x: parent.x + parent.w / 2, y: parent.y + parent.h / 2 };
  const cc = { x: child.x + child.w / 2, y: child.y + child.h / 2 };
  const dx = cc.x - pc.x;
  const dy = cc.y - pc.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const rightward = dx >= 0;
    const from = {
      x: rightward ? parent.x + parent.w : parent.x,
      y: pc.y,
    };
    const to = { x: rightward ? child.x : child.x + child.w, y: cc.y };
    const midX = (from.x + to.x) / 2;
    return { from, to, c1: { x: midX, y: from.y }, c2: { x: midX, y: to.y } };
  }

  const downward = dy >= 0;
  const from = { x: pc.x, y: downward ? parent.y + parent.h : parent.y };
  const to = { x: cc.x, y: downward ? child.y : child.y + child.h };
  const midY = (from.y + to.y) / 2;
  return { from, to, c1: { x: from.x, y: midY }, c2: { x: to.x, y: midY } };
};

/** SVG path for a parent→child edge. */
export const mindmapEdgePath = (parent: Box, child: Box): string => {
  const g = mindmapEdgeGeometry(parent, child);
  return `M ${g.from.x} ${g.from.y} C ${g.c1.x} ${g.c1.y}, ${g.c2.x} ${g.c2.y}, ${g.to.x} ${g.to.y}`;
};
