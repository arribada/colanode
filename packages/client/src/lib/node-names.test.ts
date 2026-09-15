import { describe, expect, it } from 'vitest';

import {
  normalizeNodeName,
  pickSameNameNodes,
} from '@colanode/client/lib/node-names';

const pages = [
  { id: 'a', type: 'page', name: 'Requirements' },
  { id: 'b', type: 'page', name: '  requirements ' },
  { id: 'c', type: 'page', name: 'Requirements (draft)' },
  { id: 'd', type: 'page', name: null },
  { id: 'e', type: 'folder', name: 'Réquirements' },
];

describe('normalizeNodeName', () => {
  it('ignores case and stray spaces', () => {
    expect(normalizeNodeName('  Overview   &  Tracking ')).toBe(
      'overview & tracking'
    );
  });

  it('keeps accents: they make a different word', () => {
    expect(normalizeNodeName('Réquirements')).not.toBe(
      normalizeNodeName('Requirements')
    );
  });
});

describe('pickSameNameNodes', () => {
  it('finds the other pages with the same title', () => {
    expect(pickSameNameNodes('Requirements', pages, undefined, 5).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('never counts the page being named', () => {
    expect(pickSameNameNodes('Requirements', pages, 'a', 5).map((p) => p.id)).toEqual(['b']);
  });

  it('says nothing about an empty title', () => {
    expect(pickSameNameNodes('   ', pages, undefined, 5)).toEqual([]);
  });

  it('does not match a title that only starts the same way', () => {
    expect(pickSameNameNodes('Requirements (draft)', pages, undefined, 5).map((p) => p.id)).toEqual(['c']);
  });

  it('stops at the limit', () => {
    expect(pickSameNameNodes('Requirements', pages, undefined, 1)).toHaveLength(1);
  });
});
