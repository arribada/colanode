import { describe, expect, it } from 'vitest';

import { BoardElement, BoardScene } from '@colanode/core';
import {
  addMindmapChild,
  addMindmapSibling,
  hasMindmapChildren,
  mindmapChildren,
  canReparentMindmap,
  mindmapDescendantIds,
  mindmapEdgeGeometry,
  mindmapEdges,
  mindmapHiddenIds,
  mindmapRootOf,
  reparentMindmap,
  relayoutMindmap,
  toggleMindmapCollapsed,
} from '@colanode/ui/lib/board/mindmap';

let seq = 0;
const node = (
  id: string,
  parentId?: string,
  extra: Partial<BoardElement> = {}
): BoardElement => ({
  id,
  type: 'mindmap',
  x: 0,
  y: 0,
  w: 170,
  h: 52,
  z: `z${(seq++).toString().padStart(4, '0')}`,
  style: {},
  text: id,
  mindmap: parentId ? { parentId } : {},
  ...extra,
});

const sceneOf = (...els: BoardElement[]): BoardScene => {
  const scene: BoardScene = {};
  for (const el of els) {
    scene[el.id] = el;
  }
  return scene;
};

describe('mindmapChildren / roots', () => {
  it('lists direct children and finds the root', () => {
    const scene = sceneOf(
      node('r', undefined, { x: 100, y: 100 }),
      node('a', 'r'),
      node('b', 'r'),
      node('a1', 'a')
    );
    expect(mindmapChildren(scene, 'r').map((e) => e.id)).toEqual(['a', 'b']);
    expect(mindmapChildren(scene, 'a').map((e) => e.id)).toEqual(['a1']);
    expect(mindmapRootOf(scene, 'a1')).toBe('r');
    expect(mindmapRootOf(scene, 'r')).toBe('r');
  });
});

describe('addMindmapChild', () => {
  it('adds a child linked to the parent and keeps the root anchored', () => {
    const scene = sceneOf(node('r', undefined, { x: 100, y: 100 }));
    const res = addMindmapChild(scene, 'r');
    expect(res).not.toBeNull();
    const { scene: next, newId } = res!;
    expect(next[newId]!.mindmap?.parentId).toBe('r');
    // the child sits to the right of the root
    expect(next[newId]!.x).toBeGreaterThan(next.r!.x);
    // root did not move
    expect(next.r!.x).toBe(100);
    expect(next.r!.y).toBe(100);
  });

  it('expands a collapsed parent when adding a child', () => {
    const scene = sceneOf(
      node('r', undefined, { mindmap: { collapsed: true } })
    );
    const res = addMindmapChild(scene, 'r')!;
    expect(res.scene.r!.mindmap?.collapsed).toBe(false);
  });
});

describe('addMindmapSibling', () => {
  it('adds a sibling as a child of the shared parent', () => {
    const scene = sceneOf(node('r'), node('a', 'r'));
    const res = addMindmapSibling(scene, 'a')!;
    expect(res.scene[res.newId]!.mindmap?.parentId).toBe('r');
    expect(mindmapChildren(res.scene, 'r')).toHaveLength(2);
  });

  it('spawns a new root below when the node is itself a root', () => {
    const scene = sceneOf(node('r', undefined, { x: 10, y: 10 }));
    const res = addMindmapSibling(scene, 'r')!;
    expect(res.scene[res.newId]!.mindmap?.parentId).toBeUndefined();
    expect(res.scene[res.newId]!.y).toBeGreaterThan(res.scene.r!.y);
  });
});

describe('collapse', () => {
  it('toggles collapsed and hides descendants', () => {
    const scene = sceneOf(node('r'), node('a', 'r'), node('a1', 'a'));
    expect(hasMindmapChildren(scene, 'r')).toBe(true);
    expect(mindmapHiddenIds(scene).size).toBe(0);
    const collapsed = toggleMindmapCollapsed(scene, 'r').scene;
    expect(collapsed.r!.mindmap?.collapsed).toBe(true);
    const hidden = mindmapHiddenIds(collapsed);
    expect(hidden.has('a')).toBe(true);
    expect(hidden.has('a1')).toBe(true);
    // toggling again reveals them
    const expanded = toggleMindmapCollapsed(collapsed, 'r').scene;
    expect(mindmapHiddenIds(expanded).size).toBe(0);
  });
});

describe('mindmapEdges', () => {
  it('emits a parent->child edge per link and skips hidden ones', () => {
    const scene = sceneOf(node('r'), node('a', 'r'), node('a1', 'a'));
    expect(mindmapEdges(scene)).toHaveLength(2);
    const collapsed = toggleMindmapCollapsed(scene, 'r').scene;
    // r collapsed -> a and a1 hidden -> no visible edges
    expect(mindmapEdges(collapsed)).toHaveLength(0);
  });
});

describe('relayoutMindmap', () => {
  it('stacks children vertically without overlap', () => {
    const scene = sceneOf(
      node('r', undefined, { x: 0, y: 0 }),
      node('a', 'r'),
      node('b', 'r'),
      node('c', 'r')
    );
    const { scene: next } = relayoutMindmap(scene, 'r');
    const ys = ['a', 'b', 'c'].map((id) => next[id]!.y).sort((p, q) => p - q);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(next.a!.h);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(next.a!.h);
    // all children share the same column (x) to the right of the root
    expect(next.a!.x).toBe(next.b!.x);
    expect(next.a!.x).toBeGreaterThan(next.r!.x);
  });
});

describe('mindmapEdgeGeometry', () => {
  const parent = { x: 0, y: 0, w: 100, h: 40 };

  it('leaves the right side for a child to the right', () => {
    const g = mindmapEdgeGeometry(parent, { x: 200, y: 0, w: 100, h: 40 });
    expect(g.from).toEqual({ x: 100, y: 20 });
    expect(g.to).toEqual({ x: 200, y: 20 });
    // controls bow horizontally
    expect(g.c1.y).toBe(g.from.y);
    expect(g.c2.y).toBe(g.to.y);
  });

  it('leaves the left side for a child to the left', () => {
    const g = mindmapEdgeGeometry(parent, { x: -200, y: 0, w: 100, h: 40 });
    expect(g.from).toEqual({ x: 0, y: 20 });
    expect(g.to).toEqual({ x: -100, y: 20 });
  });

  it('leaves the bottom for a child below', () => {
    const g = mindmapEdgeGeometry(parent, { x: 0, y: 200, w: 100, h: 40 });
    expect(g.from).toEqual({ x: 50, y: 40 });
    expect(g.to).toEqual({ x: 50, y: 200 });
    // controls bow vertically
    expect(g.c1.x).toBe(g.from.x);
    expect(g.c2.x).toBe(g.to.x);
  });

  it('leaves the top for a child above', () => {
    const g = mindmapEdgeGeometry(parent, { x: 0, y: -200, w: 100, h: 40 });
    expect(g.from).toEqual({ x: 50, y: 0 });
    expect(g.to).toEqual({ x: 50, y: -160 });
  });
});

describe('reparenting', () => {
  // root -> a -> a1, root -> b
  const node = (id: string, parentId?: string, x = 0, y = 0): BoardElement =>
    ({
      id,
      type: 'mindmap',
      x,
      y,
      w: 160,
      h: 48,
      z: id,
      style: {},
      mindmap: parentId ? { parentId } : {},
    }) as BoardElement;

  const scene = (): BoardScene => ({
    root: node('root'),
    a: node('a', 'root', 240, 0),
    a1: node('a1', 'a', 480, 0),
    b: node('b', 'root', 240, 100),
  });

  it('lists descendants, not the node itself', () => {
    expect([...mindmapDescendantIds(scene(), 'root')].sort()).toEqual([
      'a',
      'a1',
      'b',
    ]);
    expect([...mindmapDescendantIds(scene(), 'a')]).toEqual(['a1']);
    expect([...mindmapDescendantIds(scene(), 'a1')]).toEqual([]);
  });

  it('allows moving a branch to a sibling', () => {
    expect(canReparentMindmap(scene(), 'a', 'b')).toBe(true);
    const out = reparentMindmap(scene(), 'a', 'b');
    expect(out.scene.a!.mindmap!.parentId).toBe('b');
    // the subtree follows its parent
    expect(out.scene.a1!.mindmap!.parentId).toBe('a');
    expect(mindmapRootOf(out.scene, 'a1')).toBe('root');
  });

  it('refuses a drop onto its own descendant', () => {
    expect(canReparentMindmap(scene(), 'a', 'a1')).toBe(false);
    const out = reparentMindmap(scene(), 'a', 'a1');
    expect(out.changedIds).toEqual([]);
    expect(out.scene.a!.mindmap!.parentId).toBe('root');
  });

  it('refuses a drop onto itself, or onto the parent it already has', () => {
    expect(canReparentMindmap(scene(), 'a', 'a')).toBe(false);
    expect(canReparentMindmap(scene(), 'a', 'root')).toBe(false);
  });

  it('relayouts so the moved branch sits under its new parent', () => {
    const out = reparentMindmap(scene(), 'a', 'b');
    // 'a' now hangs off 'b', so it must be further right than 'b' is
    expect(out.scene.a!.x).toBeGreaterThan(out.scene.b!.x);
    expect(out.changedIds).toContain('a');
  });
});
