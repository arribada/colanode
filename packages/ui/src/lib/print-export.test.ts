import { describe, expect, it } from 'vitest';

import { LocalNode } from '@colanode/client/types';
import { collectPageTree } from '@colanode/ui/lib/print-export';

const node = (
  id: string,
  type: string,
  parentId: string,
  index?: string
): LocalNode => ({ id, type, parentId, index }) as unknown as LocalNode;

describe('collectPageTree', () => {
  // The WildSpy Dingo Tag project as it sits in the wiki: four pages were
  // dragged into place (Client inputs, BLE proximity ranging, Hardware
  // architecture, Power budget), the others never were.
  const root = '01kyq1g6x21jr8bt0c1dn5c42bpg';
  const designOptions = '01m4dpca33s24y9kabnvqswvb3pg';
  const names: Record<string, string> = {
    [root]: 'WildSpy Dingo Tag',
    '01kyq1gmxk8q1g6pbfxd308xq9pg': 'Overview',
    '01m4dkvqvzxga028cqmbx4eze5pg': 'Requirements',
    '01m4dkwbs6m3ybyf30bb7s4q25pg': 'Constraints',
    '01m4dkwt4ykj58zp92bna3zj51pg': 'State of the Art',
    [designOptions]: 'Design options',
    '01m4dkx6fzmveqd4bke2cvte8fpg': 'Decisions',
    '01m4dpjagev5c2kpqvbq5a46tzpg': 'BLE proximity ranging',
    '01m4dsk4t0mva277ndb9excf3bpg': 'Off-the-shelf prototype',
    '01m4fh9k51ryk4mfy86pa6r384pg': 'Client inputs',
    '01m5hqa7r98p5t2vx9j9m3w6cqpg': 'Hardware architecture',
    '01m5hrfnkbbbdpqcks5a4azkd0pg': 'Power budget',
  };
  const wildspy = [
    node(root, 'page', '01ky60x991xbrpsaaxzps356e7pg'),
    node('01kyq1gmxk8q1g6pbfxd308xq9pg', 'page', root),
    node('01m4dkvqvzxga028cqmbx4eze5pg', 'page', root),
    node('01m4dkwbs6m3ybyf30bb7s4q25pg', 'page', root),
    node('01m4dkwt4ykj58zp92bna3zj51pg', 'page', root),
    node(designOptions, 'page', root),
    node('01m4dkx6fzmveqd4bke2cvte8fpg', 'page', designOptions),
    node('01m4dpjagev5c2kpqvbq5a46tzpg', 'page', root, 'a3V'),
    node('01m4dsk4t0mva277ndb9excf3bpg', 'page', root),
    node('01m4fh9k51ryk4mfy86pa6r384pg', 'page', root, 'a0V'),
    node('01m5hqa7r98p5t2vx9j9m3w6cqpg', 'page', root, 'a5'),
    node('01m5hrfnkbbbdpqcks5a4azkd0pg', 'page', root, 'a5V'),
  ];

  it('exports the chapters in the order the pages were arranged', () => {
    const tree = collectPageTree(root, wildspy);
    expect(tree.map((e) => [names[e.id], e.depth])).toEqual([
      ['WildSpy Dingo Tag', 0],
      ['Overview', 1],
      ['Client inputs', 1],
      ['Requirements', 1],
      ['Constraints', 1],
      ['State of the Art', 1],
      ['BLE proximity ranging', 1],
      ['Design options', 1],
      ['Decisions', 2],
      ['Hardware architecture', 1],
      ['Power budget', 1],
      ['Off-the-shelf prototype', 1],
    ]);
  });

  it('orders a page among all its siblings, not only the pages', () => {
    // D was dragged between the database B (default key a1) and the page C
    // (a2). Ordered among the pages alone, C would take a1 and D land after it.
    const tree = collectPageTree('r', [
      node('a', 'page', 'r'),
      node('b', 'database', 'r'),
      node('c', 'page', 'r'),
      node('d', 'page', 'r', 'a1V'),
    ]);
    expect(tree.map((e) => e.id)).toEqual(['r', 'a', 'd', 'c']);
  });

  it('leaves out databases, records and what they hold', () => {
    const tree = collectPageTree('r', [
      node('a', 'database', 'r'),
      node('b', 'record', 'a'),
      node('c', 'page', 'b'),
      node('d', 'page', 'r'),
    ]);
    expect(tree.map((e) => e.id)).toEqual(['r', 'd']);
  });
});
