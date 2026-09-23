import { type JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import {
  buildSlides,
  headingLevel,
  splitLevelOf,
  weigh,
} from '@colanode/ui/lib/present-slides';

let counter = 0;
const id = () => `b${++counter}`;

const heading = (level: number, text: string): JSONContent => ({
  type: `heading${level}`,
  attrs: { id: id() },
  content: [{ type: 'text', text }],
});

const para = (text: string): JSONContent => ({
  type: 'paragraph',
  attrs: { id: id() },
  content: [{ type: 'text', text }],
});

describe('headingLevel', () => {
  it('reads the level from the node type', () => {
    expect(headingLevel({ type: 'heading1' })).toBe(1);
    expect(headingLevel({ type: 'heading5' })).toBe(5);
  });

  it('reads the level from the attribute of a pasted heading', () => {
    expect(headingLevel({ type: 'heading', attrs: { level: 2 } })).toBe(2);
    expect(headingLevel({ type: 'heading' })).toBe(1);
  });

  it('is null for anything else', () => {
    expect(headingLevel({ type: 'paragraph' })).toBeNull();
    expect(headingLevel({ type: 'headingNumber' })).toBeNull();
  });
});

describe('weigh', () => {
  it('counts a long paragraph as several lines', () => {
    expect(weigh(para('x'.repeat(240)))).toBe(3);
    expect(weigh(para('short'))).toBe(1);
  });

  it('gives a picture and a table real room', () => {
    expect(weigh({ type: 'image', attrs: {} })).toBe(8);
    expect(
      weigh({ type: 'table', content: [{}, {}, {}, {}] as JSONContent[] })
    ).toBe(5);
  });
});

describe('splitLevelOf', () => {
  it('cuts at the shallowest level that appears more than once', () => {
    expect(splitLevelOf([heading(1, 'A'), para('x'), heading(1, 'B')])).toBe(1);
  });

  it('goes one level deeper when the page has a single title', () => {
    expect(
      splitLevelOf([
        heading(1, 'Title'),
        heading(2, 'One'),
        para('x'),
        heading(2, 'Two'),
      ])
    ).toBe(2);
  });

  it('is null when the page has no headings at all', () => {
    expect(splitLevelOf([para('a'), para('b')])).toBeNull();
  });
});

describe('buildSlides in section mode', () => {
  it('starts a new slide at every heading of the split level', () => {
    const slides = buildSlides(
      [
        heading(1, 'Title'),
        para('intro'),
        heading(2, 'First'),
        para('one'),
        heading(2, 'Second'),
        para('two'),
      ],
      'section'
    );

    // The title heading is shallower than the split level, so it opens the
    // first slide rather than being swallowed into it.
    expect(slides.map((s) => s.title)).toEqual(['Title', 'First', 'Second']);
    expect(slides[0]?.nodes).toHaveLength(2);
    expect(slides.every((s) => s.continued === false)).toBe(true);
  });

  it('breaks a section that is too long and marks the rest as continued', () => {
    const slides = buildSlides(
      [heading(1, 'One'), para('a'.repeat(700)), heading(1, 'Two'), para('b')],
      'section',
      6
    );

    expect(slides.map((s) => [s.title, s.continued])).toEqual([
      ['One', false],
      ['One', true],
      ['Two', false],
    ]);
  });

  it('keeps a single oversized block on its own slide rather than splitting it', () => {
    const slides = buildSlides(
      [para('short'), { type: 'image', attrs: { id: id() } }],
      'size',
      4
    );

    expect(slides).toHaveLength(2);
    expect(slides[1]?.nodes[0]?.type).toBe('image');
  });
});

describe('buildSlides in size mode', () => {
  it('ignores headings and fills each slide to the budget', () => {
    const slides = buildSlides(
      [para('a'), heading(1, 'H'), para('b'), para('c'), para('d')],
      'size',
      3
    );

    // a(1) + H(2) = 3, then b + c + d = 3
    expect(slides.map((s) => s.nodes.length)).toEqual([2, 3]);
    expect(slides.map((s) => s.title)).toEqual([null, null]);
  });

  it('returns nothing for an empty document', () => {
    expect(buildSlides([], 'section')).toEqual([]);
    expect(buildSlides([{} as JSONContent], 'section')).toEqual([]);
  });
});
