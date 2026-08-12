import { describe, expect, it } from 'vitest';

import {
  BOARD_SHAPES,
  boardShapePath,
  isBoardShapeId,
} from '@colanode/ui/lib/board/shapes';

const rect = { x: 100, y: 50, w: 200, h: 120 };

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EMPTY: Box = {
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
};

const include = (b: Box, x: number, y: number): void => {
  b.minX = Math.min(b.minX, x);
  b.minY = Math.min(b.minY, y);
  b.maxX = Math.max(b.maxX, x);
  b.maxY = Math.max(b.maxY, y);
};

/**
 * Endpoint-to-centre conversion for an SVG elliptical arc (no rotation, which
 * is all these shapes use). From the SVG spec's implementation notes.
 */
const arcCentre = (
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number
): { cx: number; cy: number } => {
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const num = rx2 * ry2 - rx2 * dy2 * dy2 - ry2 * dx2 * dx2;
  const den = rx2 * dy2 * dy2 + ry2 * dx2 * dx2;
  // Clamped at zero: when the radii are exactly big enough for the chord,
  // floating point can push this a hair negative and NaN the whole box.
  const factor =
    (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (factor * (rx * dy2)) / ry;
  const cy1 = (factor * -(ry * dx2)) / rx;
  return { cx: cx1 + (x1 + x2) / 2, cy: cy1 + (y1 + y2) / 2 };
};

/**
 * A box the path is guaranteed to fit inside.
 *
 * Deliberately CONSERVATIVE: an arc contributes the bounding box of the whole
 * ellipse it belongs to, and a quadratic contributes its control point (a
 * bezier lies inside the hull of its points). Both over-estimate, so a shape
 * that passes is genuinely inside its box — the mistake this must never make
 * is under-reporting, which is exactly what measuring on-path points alone
 * does: the anchors of a pill sit well inside the box while its arcs bulge
 * out to the edges.
 */
const pathBounds = (d: string): Box => {
  const box = { ...EMPTY };
  const tokens = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) ?? [];
  let i = 0;
  let x = 0;
  let y = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++]!;
    // Relative commands are the same geometry measured from where the pen is,
    // so each one resolves to its absolute form and shares the code below.
    const rel = cmd === cmd.toLowerCase() && cmd !== 'z';
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;

    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
        x = ox + num();
        y = oy + num();
        include(box, x, y);
        break;
      case 'H':
        x = ox + num();
        include(box, x, y);
        break;
      case 'V':
        y = oy + num();
        include(box, x, y);
        break;
      case 'A': {
        const rx = num();
        const ry = num();
        num(); // rotation, always 0 here
        const largeArc = num();
        const sweep = num();
        const x2 = ox + num();
        const y2 = oy + num();
        const { cx, cy } = arcCentre(x, y, rx, ry, largeArc, sweep, x2, y2);
        include(box, cx - rx, cy - ry);
        include(box, cx + rx, cy + ry);
        x = x2;
        y = y2;
        include(box, x, y);
        break;
      }
      case 'Q': {
        const cx = ox + num();
        const cy = oy + num();
        include(box, cx, cy);
        x = ox + num();
        y = oy + num();
        include(box, x, y);
        break;
      }
      case 'Z':
        break;
      default:
        // Still throws on anything it has not been taught: a parser that
        // guesses would report a shape as fitting when nobody checked.
        throw new Error(`unhandled path command: ${cmd}`);
    }
  }
  return box;
};

describe('board shapes', () => {
  it('every shape stays inside its own box', () => {
    // A shape that overflowed would sit outside its own selection box and hit
    // area, so this is the property the whole "path over the bounding box"
    // design rests on.
    for (const shape of BOARD_SHAPES) {
      const b = pathBounds(shape.path(rect));
      expect(b.minX, `${shape.id} left`).toBeGreaterThanOrEqual(rect.x - 0.01);
      expect(b.minY, `${shape.id} top`).toBeGreaterThanOrEqual(rect.y - 0.01);
      expect(b.maxX, `${shape.id} right`).toBeLessThanOrEqual(
        rect.x + rect.w + 0.01
      );
      expect(b.maxY, `${shape.id} bottom`).toBeLessThanOrEqual(
        rect.y + rect.h + 0.01
      );
    }
  });

  // Shapes that keep their proportions on purpose. A checkbox drawn 200 wide
  // and 120 tall is not a checkbox, so these stay square (or nearly) and
  // centre themselves — they cannot fill the long side, and should not.
  // Named rather than detected: an exemption you have to type is one somebody
  // has to justify, and a shape that quietly stops filling its box still
  // fails.
  const ASPECT_LOCKED = new Set(['checkbox', 'toggle', 'avatar']);

  it('every shape fills most of its box, rather than hiding in a corner', () => {
    for (const shape of BOARD_SHAPES) {
      const b = pathBounds(shape.path(rect));
      const short = Math.min(rect.w, rect.h);
      if (ASPECT_LOCKED.has(shape.id)) {
        // Must still fill the SHORT side, so it is not a token mark in the
        // middle of a large box.
        expect(b.maxY - b.minY, `${shape.id} height`).toBeGreaterThan(
          short * 0.6
        );
        expect(b.maxX - b.minX, `${shape.id} width`).toBeGreaterThan(
          short * 0.5
        );
        continue;
      }
      expect(b.maxX - b.minX, `${shape.id} width`).toBeGreaterThan(
        rect.w * 0.6
      );
      expect(b.maxY - b.minY, `${shape.id} height`).toBeGreaterThan(
        rect.h * 0.6
      );
    }
  });

  it('an aspect-locked shape stays square whatever box it is given', () => {
    // The property the exemption above rests on — asserted, not assumed.
    for (const id of ASPECT_LOCKED) {
      const shape = BOARD_SHAPES.find((s) => s.id === id)!;
      const b = pathBounds(shape.path({ x: 0, y: 0, w: 600, h: 100 }));
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      // Within a factor of two of square, on a box six times wider than tall.
      expect(w / h, `${id} aspect`).toBeLessThan(2.2);
    }
  });

  it('every shape closes its outline', () => {
    for (const shape of BOARD_SHAPES) {
      expect(shape.path(rect), shape.id).toContain('Z');
    }
  });

  it('every shape survives a degenerate box without producing NaN', () => {
    for (const shape of BOARD_SHAPES) {
      const d = shape.path({ x: 0, y: 0, w: 1, h: 1 });
      expect(d, shape.id).not.toContain('NaN');
    }
  });

  it('a triangle is three corners of the box', () => {
    const d = boardShapePath('triangle', rect)!;
    expect(d).toBe('M 200 50 L 300 170 L 100 170 Z');
  });

  it('rounds a rectangle by the SHORT side, not the long one', () => {
    // A wide flat box must not get corners rounder than it is tall.
    const flat = boardShapePath('roundRect', { x: 0, y: 0, w: 400, h: 20 })!;
    expect(flat).toContain('A 5 5');
  });

  it('returns null for a shape it does not know, rather than throwing', () => {
    // A board written by a newer client can carry a shape this one has never
    // heard of; falling back to a rectangle beats breaking the board.
    expect(boardShapePath('dodecahedron', rect)).toBeNull();
    expect(boardShapePath(undefined, rect)).toBeNull();
  });

  it('recognises its own ids', () => {
    expect(isBoardShapeId('hexagon')).toBe(true);
    expect(isBoardShapeId('nope')).toBe(false);
  });
});
