import { describe, expect, it } from 'vitest';

import { BoardElement, BoardScene } from '@colanode/core';
import { frameOrder } from '@colanode/ui/lib/board/elements';

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
