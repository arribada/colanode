import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BoardElement, BoardScene } from '@colanode/core';
import { BoardElementView } from '@colanode/ui/components/whiteboards/board/board-element';
import { boardShapePath } from '@colanode/ui/lib/board/shapes';

// Static markup only: these elements draw straight from their props, with no
// hooks or context, so the produced SVG is the whole behaviour worth pinning.
const render = (element: BoardElement, scene: BoardScene = {}) =>
  renderToStaticMarkup(
    <BoardElementView
      element={element}
      scene={{ [element.id]: element, ...scene }}
      canEdit={false}
    />
  );

const box = (over: Partial<BoardElement> = {}): BoardElement =>
  ({
    id: 'e1',
    type: 'rect',
    x: 10,
    y: 20,
    w: 100,
    h: 60,
    z: 'a0',
    style: { fill: '#ffffff', stroke: '#334155', strokeWidth: 2 },
    ...over,
  }) as BoardElement;

describe('BoardElementView shapes', () => {
  it('draws a plain rectangle when no outline is named', () => {
    const svg = render(box());
    expect(svg).toContain('<rect');
    expect(svg).not.toContain('<path');
  });

  it('draws the named outline instead of the rectangle', () => {
    const svg = render(box({ shape: 'hexagon' }));
    const expected = boardShapePath('hexagon', {
      x: 10,
      y: 20,
      w: 100,
      h: 60,
    })!;
    expect(svg).toContain(expected);
    // The base rectangle must be GONE, not merely covered — the switch that
    // selects the outline ends in a branch that clears it, and an earlier
    // version of this silently threw the path away.
    expect(svg).not.toContain('<rect');
  });

  it('falls back to the rectangle for an outline it does not know', () => {
    // A board written by a newer client can name a shape this one has never
    // heard of; drawing nothing at all would lose the element entirely.
    const svg = render(box({ shape: 'dodecahedron' }));
    expect(svg).toContain('<rect');
  });

  it('applies an outline to an ellipse and a diamond too', () => {
    expect(render(box({ type: 'ellipse', shape: 'star' }))).toContain('<path');
    expect(render(box({ type: 'diamond', shape: 'cloud' }))).toContain(
      '<path'
    );
  });

  it('ignores an outline on elements whose look is part of what they are', () => {
    // A sticky note that renders as a star is not a sticky note.
    const svg = render(box({ type: 'sticky', shape: 'star' }));
    expect(svg).toContain('<rect');
  });
});

describe('BoardElementView connectors', () => {
  const line = (over: Partial<BoardElement> = {}): BoardElement =>
    ({
      id: 'c1',
      type: 'connector',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      z: 'a1',
      style: { stroke: '#334155', strokeWidth: 2 },
      points: [
        [0, 50],
        [100, 50],
      ],
      connector: { arrowEnd: true },
      ...over,
    }) as BoardElement;

  const crossing: BoardElement = {
    id: 'c2',
    type: 'connector',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    z: 'a2',
    style: {},
    points: [
      [50, 0],
      [50, 100],
    ],
    connector: { arrowEnd: true },
  } as BoardElement;

  it('draws a straight line with no hop when jumps are off', () => {
    const svg = render(line(), { c2: crossing });
    expect(svg).toContain('M 0 50 L 100 50');
  });

  it('hops over a crossing line when jumps are on', () => {
    const svg = render(
      line({ connector: { arrowEnd: true, jumps: true } }),
      { c2: crossing }
    );
    expect(svg).toContain('A 5 5 0 0 1');
  });
});
