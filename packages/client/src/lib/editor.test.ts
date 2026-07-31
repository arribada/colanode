import { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { mapBlocksToContents, mapContentsToBlocks } from './editor';

const toggleContents: JSONContent[] = [
  {
    type: 'toggle',
    attrs: { id: 'toggle1', open: true },
    content: [
      {
        type: 'toggleSummary',
        attrs: { id: 'summary1' },
        content: [
          { type: 'text', text: 'Summary title', marks: [{ type: 'bold' }] },
        ],
      },
      {
        type: 'toggleContent',
        attrs: { id: 'content1' },
        content: [
          {
            type: 'paragraph',
            attrs: { id: 'p1' },
            content: [{ type: 'text', text: 'Hidden text' }],
          },
        ],
      },
    ],
  },
];

const calloutContents: JSONContent[] = [
  {
    type: 'callout',
    attrs: { id: 'callout1', icon: 'emoji-bulb', color: 'blue' },
    content: [
      {
        type: 'paragraph',
        attrs: { id: 'p2' },
        content: [{ type: 'text', text: 'Important note' }],
      },
    ],
  },
];

describe('mapContentsToBlocks with toggle blocks', () => {
  const blocks = mapContentsToBlocks('doc1', toggleContents, new Map());

  it('maps toggle as a container block (no leaf content)', () => {
    const toggle = blocks['toggle1'];
    expect(toggle).toBeDefined();
    expect(toggle?.type).toBe('toggle');
    expect(toggle?.parentId).toBe('doc1');
    expect(toggle?.attrs).toEqual({ open: true });
    expect(toggle?.content ?? null).toBeNull();
  });

  it('maps toggleSummary as a leaf block holding inline text', () => {
    const summary = blocks['summary1'];
    expect(summary).toBeDefined();
    expect(summary?.type).toBe('toggleSummary');
    expect(summary?.parentId).toBe('toggle1');
    expect(summary?.content).toEqual([
      {
        type: 'text',
        text: 'Summary title',
        attrs: undefined,
        marks: [{ type: 'bold', attrs: undefined }],
      },
    ]);
  });

  it('maps toggleContent as a container with nested paragraph blocks', () => {
    const content = blocks['content1'];
    expect(content).toBeDefined();
    expect(content?.type).toBe('toggleContent');
    expect(content?.parentId).toBe('toggle1');
    expect(content?.content ?? null).toBeNull();

    const paragraph = blocks['p1'];
    expect(paragraph).toBeDefined();
    expect(paragraph?.parentId).toBe('content1');
    expect(paragraph?.content?.[0]?.text).toBe('Hidden text');
  });

  it('round-trips toggle structure through mapBlocksToContents', () => {
    const contents = mapBlocksToContents('doc1', Object.values(blocks));
    expect(contents).toHaveLength(1);

    const toggle = contents[0];
    expect(toggle?.type).toBe('toggle');
    expect(toggle?.attrs).toEqual({ id: 'toggle1', open: true });
    expect(toggle?.content).toHaveLength(2);
    expect(toggle?.content?.[0]?.type).toBe('toggleSummary');
    expect(toggle?.content?.[0]?.content?.[0]?.text).toBe('Summary title');
    expect(toggle?.content?.[1]?.type).toBe('toggleContent');
    expect(toggle?.content?.[1]?.content?.[0]?.type).toBe('paragraph');
    expect(toggle?.content?.[1]?.content?.[0]?.content?.[0]?.text).toBe(
      'Hidden text'
    );
  });
});

describe('mapContentsToBlocks with callout blocks', () => {
  const blocks = mapContentsToBlocks('doc1', calloutContents, new Map());

  it('maps callout as a container block preserving icon and color attrs', () => {
    const callout = blocks['callout1'];
    expect(callout).toBeDefined();
    expect(callout?.type).toBe('callout');
    expect(callout?.parentId).toBe('doc1');
    expect(callout?.attrs).toEqual({ icon: 'emoji-bulb', color: 'blue' });
    expect(callout?.content ?? null).toBeNull();
  });

  it('maps callout children as nested blocks', () => {
    const paragraph = blocks['p2'];
    expect(paragraph).toBeDefined();
    expect(paragraph?.type).toBe('paragraph');
    expect(paragraph?.parentId).toBe('callout1');
    expect(paragraph?.content?.[0]?.text).toBe('Important note');
  });

  it('round-trips callout structure through mapBlocksToContents', () => {
    const contents = mapBlocksToContents('doc1', Object.values(blocks));
    expect(contents).toHaveLength(1);

    const callout = contents[0];
    expect(callout?.type).toBe('callout');
    expect(callout?.attrs).toEqual({
      id: 'callout1',
      icon: 'emoji-bulb',
      color: 'blue',
    });
    expect(callout?.content).toHaveLength(1);
    expect(callout?.content?.[0]?.type).toBe('paragraph');
    expect(callout?.content?.[0]?.content?.[0]?.text).toBe('Important note');
  });
});

const mathContents: JSONContent[] = [
  {
    type: 'mathBlock',
    attrs: { id: 'math1', latex: '\\frac{a}{b}' },
  },
  {
    type: 'paragraph',
    attrs: { id: 'p3' },
    content: [
      { type: 'text', text: 'Euler: ' },
      {
        type: 'mathInline',
        attrs: { id: 'mi1', latex: 'e^{i\\pi} + 1 = 0' },
      },
    ],
  },
];

describe('mapContentsToBlocks with math nodes', () => {
  const blocks = mapContentsToBlocks('doc1', mathContents, new Map());

  it('maps mathBlock as a leaf block preserving the latex attr', () => {
    const math = blocks['math1'];
    expect(math).toBeDefined();
    expect(math?.type).toBe('mathBlock');
    expect(math?.parentId).toBe('doc1');
    expect(math?.attrs).toEqual({ latex: '\\frac{a}{b}' });
    expect(math?.content ?? null).toBeNull();
  });

  it('never creates child blocks under a mathBlock', () => {
    const children = Object.values(blocks).filter(
      (block) => block.parentId === 'math1'
    );
    expect(children).toHaveLength(0);
  });

  it('maps mathInline as an inline leaf of its paragraph', () => {
    const paragraph = blocks['p3'];
    expect(paragraph).toBeDefined();
    expect(paragraph?.content).toEqual([
      { type: 'text', text: 'Euler: ', attrs: undefined, marks: undefined },
      {
        type: 'mathInline',
        text: undefined,
        attrs: { id: 'mi1', latex: 'e^{i\\pi} + 1 = 0' },
        marks: undefined,
      },
    ]);
  });

  it('round-trips math nodes through mapBlocksToContents', () => {
    const contents = mapBlocksToContents('doc1', Object.values(blocks));
    expect(contents).toHaveLength(2);

    const math = contents[0];
    expect(math?.type).toBe('mathBlock');
    expect(math?.attrs).toEqual({ id: 'math1', latex: '\\frac{a}{b}' });
    expect(math?.content).toBeUndefined();

    const paragraph = contents[1];
    expect(paragraph?.type).toBe('paragraph');
    const inline = paragraph?.content?.[1];
    expect(inline?.type).toBe('mathInline');
    expect(inline?.attrs).toEqual({ id: 'mi1', latex: 'e^{i\\pi} + 1 = 0' });
  });
});
