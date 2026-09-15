import { describe, expect, it } from 'vitest';

import { extractBlocksMentions } from '@colanode/core/lib/mentions';
import { extractBlockTexts } from '@colanode/core/lib/texts';
import { Block } from '@colanode/core/registry/block';

// The walks as they were before the children index: kept here as the
// reference the faster walks must match output for output.
const referenceText = (blockId: string, blocks: Record<string, Block>): string => {
  const texts: string[] = [];
  const block = blocks[blockId];
  if (block) {
    let text = '';
    for (const leaf of block.content ?? []) {
      if (leaf.text) {
        text += leaf.text;
      }
    }
    texts.push(text);
  }
  const children = Object.values(blocks)
    .filter((child) => child.parentId === blockId)
    .sort((a, b) => a.index.localeCompare(b.index));
  for (const child of children) {
    texts.push(referenceText(child.id, blocks));
  }
  return texts.join('\n');
};

const referenceMentions = (
  blockId: string,
  blocks: Record<string, Block>
): { id: string; target: string }[] => {
  const mentions: { id: string; target: string }[] = [];
  for (const leaf of blocks[blockId]?.content ?? []) {
    if (leaf.type === 'mention' && leaf.attrs?.target && leaf.attrs?.id) {
      mentions.push({ id: leaf.attrs.id, target: leaf.attrs.target });
    }
  }
  const children = Object.values(blocks)
    .filter((child) => child.parentId === blockId)
    .sort((a, b) => a.index.localeCompare(b.index));
  for (const child of children) {
    mentions.push(...referenceMentions(child.id, blocks));
  }
  return mentions;
};

// Deterministic pseudo-random numbers, so a failure is reproducible.
const random = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const buildDocument = (count: number, seed: number) => {
  const next = random(seed);
  const blocks: Record<string, Block> = {};
  const ids = ['doc'];
  for (let i = 0; i < count; i++) {
    const id = `b${i}`;
    const parentId = ids[Math.floor(next() * ids.length)] as string;
    const content: Block['content'] = [{ type: 'text', text: `text ${i}` }];
    if (next() < 0.1) {
      content.push({ type: 'mention', attrs: { id: `m${i}`, target: `t${i}` } });
    }
    blocks[id] = {
      id,
      type: 'paragraph',
      parentId,
      // Few distinct indexes, so siblings often tie and order must stay stable.
      index: String.fromCharCode(97 + Math.floor(next() * 5)),
      content,
    } as Block;
    ids.push(id);
  }
  return blocks;
};

describe('extractBlockTexts', () => {
  it('returns exactly what the per-block scan returned', () => {
    for (const seed of [1, 7, 42]) {
      const blocks = buildDocument(600, seed);
      expect(extractBlockTexts('doc', blocks)).toBe(referenceText('doc', blocks));
    }
  });

  it('reads a 4,000-block page without freezing the worker', () => {
    const blocks = buildDocument(4000, 3);
    const started = performance.now();
    extractBlockTexts('doc', blocks);
    extractBlocksMentions('doc', blocks);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('ends on a parent cycle instead of overflowing the stack', () => {
    const blocks = {
      a: { id: 'a', type: 'paragraph', parentId: 'b', index: 'a', content: [{ type: 'text', text: 'A' }] },
      b: { id: 'b', type: 'paragraph', parentId: 'a', index: 'a', content: [{ type: 'text', text: 'B' }] },
    } as unknown as Record<string, Block>;
    expect(extractBlockTexts('a', blocks)).toBe('A\nB\n');
  });
});

describe('extractBlocksMentions ordering', () => {
  it('returns the mentions in the order the per-block scan did', () => {
    for (const seed of [2, 9, 64]) {
      const blocks = buildDocument(600, seed);
      expect(extractBlocksMentions('doc', blocks)).toEqual(
        referenceMentions('doc', blocks)
      );
    }
  });
});
