import { describe, expect, it } from 'vitest';

import { BoardElement, BoardScene } from '@colanode/core';
import {
  frameOrder,
  sortedElements,
  zKeyForStep,
} from '@colanode/ui/lib/board/elements';

const frame = (
  id: string,
  x: number,
  y: number,
  w = 400,
  h = 300
): BoardElement =>
  ({ id, type: 'frame', x, y, w, h, z: id, style: {} }) as BoardElement;

const scene = (...els: BoardElement[]): BoardScene =>
  Object.fromEntries(els.map((el) => [el.id, el]));

describe('frameOrder', () => {
  it('reads left to right, then top to bottom', () => {
    const s = scene(
      frame('c', 0, 500),
      frame('b', 500, 0),
      frame('a', 0, 0)
    );
    expect(frameOrder(s).map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a row together when the frames are not pixel-aligned', () => {
    // The trap: 'b' sits 12px lower than 'a'. A plain y-then-x sort would
    // put it on its own row and read the board vertically.
    const s = scene(frame('a', 0, 0), frame('b', 500, 12));
    expect(frameOrder(s).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('starts a new row when the frames barely overlap', () => {
    // 20px of overlap on 300-tall frames is not a shared row.
    const s = scene(frame('a', 0, 0), frame('b', 500, 280));
    expect(frameOrder(s).map((f) => f.id)).toEqual(['a', 'b']);
    const s2 = scene(frame('a', 500, 0), frame('b', 0, 280));
    // 'a' is higher, so it still comes first even though it is further right
    expect(frameOrder(s2).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('ignores everything that is not a frame', () => {
    const s = scene(frame('a', 0, 0), {
      id: 'r',
      type: 'rect',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      z: 'r',
      style: {},
    } as BoardElement);
    expect(frameOrder(s).map((f) => f.id)).toEqual(['a']);
  });

  it('is empty for a board with no frames', () => {
    expect(frameOrder({})).toEqual([]);
  });
});

const stacked = (id: string, z: string): BoardElement =>
  ({ id, type: 'rect', x: 0, y: 0, w: 10, h: 10, z, style: {} }) as BoardElement;

// three boxes, back to front: a, b, c
const stack = (): BoardScene => ({
  a: stacked('a', 'a0'),
  b: stacked('b', 'a1'),
  c: stacked('c', 'a2'),
});

const order = (s: BoardScene) => sortedElements(s).map((e) => e.id);

const step = (s: BoardScene, id: string, dir: 'up' | 'down'): BoardScene => {
  const z = zKeyForStep(s, id, dir);
  return z ? { ...s, [id]: { ...s[id]!, z } } : s;
};

describe('zKeyForStep', () => {
  it('moves one place, not all the way', () => {
    // The whole point: with three overlapping shapes, "bring to front" is the
    // wrong tool two times out of three.
    expect(order(step(stack(), 'a', 'up'))).toEqual(['b', 'a', 'c']);
  });

  it('moves back one place', () => {
    expect(order(step(stack(), 'c', 'down'))).toEqual(['a', 'c', 'b']);
  });

  it('is its own inverse', () => {
    const once = step(stack(), 'a', 'up');
    expect(order(step(once, 'a', 'down'))).toEqual(['a', 'b', 'c']);
  });

  it('refuses to move past the front or the back', () => {
    expect(zKeyForStep(stack(), 'c', 'up')).toBeNull();
    expect(zKeyForStep(stack(), 'a', 'down')).toBeNull();
  });

  it('returns null for an element that is not there', () => {
    expect(zKeyForStep(stack(), 'nope', 'up')).toBeNull();
  });

  it('walks an element all the way through the stack', () => {
    let s = stack();
    s = step(s, 'a', 'up');
    s = step(s, 'a', 'up');
    expect(order(s)).toEqual(['b', 'c', 'a']);
    expect(zKeyForStep(s, 'a', 'up')).toBeNull();
  });
});
