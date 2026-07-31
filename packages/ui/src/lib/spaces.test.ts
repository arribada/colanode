import { describe, expect, it } from 'vitest';

import { LocalNode } from '@colanode/client/types';

import { groupSpaceChildrenByType } from './spaces';

const node = (id: string, type: string): LocalNode => ({ id, type }) as LocalNode;

describe('groupSpaceChildrenByType', () => {
  it('orders sections channel → page → database → folder and drops empty types', () => {
    const groups = groupSpaceChildrenByType([
      node('f1', 'folder'),
      node('c1', 'channel'),
      node('p1', 'page'),
    ]);
    expect(groups.map((g) => g.type)).toEqual(['channel', 'page', 'folder']);
    expect(groups.map((g) => g.label)).toEqual(['Channels', 'Pages', 'Folders']);
  });

  it('filters items to their type and preserves incoming order', () => {
    const groups = groupSpaceChildrenByType([
      node('c1', 'channel'),
      node('c2', 'channel'),
      node('p1', 'page'),
    ]);
    const channels = groups.find((g) => g.type === 'channel');
    expect(channels?.items.map((i) => i.id)).toEqual(['c1', 'c2']);
  });

  it('returns a single group for a single-type space', () => {
    const groups = groupSpaceChildrenByType([
      node('c1', 'channel'),
      node('c2', 'channel'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.type).toBe('channel');
  });

  it('renders an unknown type as its own capitalized section after known types', () => {
    const groups = groupSpaceChildrenByType([
      node('x1', 'widget'),
      node('c1', 'channel'),
    ]);
    expect(groups.map((g) => g.type)).toEqual(['channel', 'widget']);
    expect(groups[1]?.label).toBe('Widget');
  });

  it('returns an empty array for no children', () => {
    expect(groupSpaceChildrenByType([])).toEqual([]);
  });
});
