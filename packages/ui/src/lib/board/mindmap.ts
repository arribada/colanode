// Mind-map helpers: read the mindmap forest out of a board scene, grow it with
// Tab (child) / Enter (sibling), keep each tree tidily laid out left-to-right
// with its root anchored in place, resolve collapsed-hidden descendants, and
// list parent→child edges. Pure — no React / DOM — so the tree + layout logic
// is unit-testable.

import { BoardElement, BoardScene } from '@colanode/core';
import { createElement, topZ } from '@colanode/ui/lib/board/elements';
import { layoutTidyTree, TidyNode } from '@colanode/ui/lib/board/tidy-tree';

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
