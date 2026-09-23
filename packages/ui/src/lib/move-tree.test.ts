import { describe, expect, it } from 'vitest';

import {
  ancestorsOf,
  buildMoveTargets,
  matchMoveTargets,
  type MoveTarget,
} from '@colanode/ui/lib/move-tree';

const ROOT = 'space1';

const page = (id: string, name: string, parentId: string) => ({
  id,
  type: 'page',
  name,
  parentId,
});

describe('buildMoveTargets', () => {
  it('walks the tree depth first with siblings in name order', () => {
    const targets = buildMoveTargets(
      [
        page('b', 'Beta', ROOT),
        page('a', 'Alpha', ROOT),
        page('a2', 'Alpha child two', 'a'),
        page('a1', 'Alpha child one', 'a'),
      ],
      ROOT,
      new Set()
    );

    expect(targets.map((t) => t.name)).toEqual([
      'Alpha',
      'Alpha child one',
      'Alpha child two',
      'Beta',
    ]);
    expect(targets.map((t) => t.depth)).toEqual([0, 1, 1, 0]);
  });

  it('records the path of ancestors and whether a page has children', () => {
    const targets = buildMoveTargets(
      [
        page('a', 'Cyprus', ROOT),
        page('b', 'Noise', 'a'),
        page('c', 'GW 2', 'b'),
      ],
      ROOT,
      new Set()
    );

    expect(targets.find((t) => t.id === 'c')?.path).toEqual([
      'Cyprus',
      'Noise',
    ]);
    expect(targets.find((t) => t.id === 'a')?.hasChildren).toBe(true);
    expect(targets.find((t) => t.id === 'c')?.hasChildren).toBe(false);
  });

  it('leaves out the page being moved and everything under it', () => {
    const targets = buildMoveTargets(
      [
        page('a', 'Alpha', ROOT),
        page('b', 'Beta', 'a'),
        page('c', 'Gamma', ROOT),
      ],
      ROOT,
      new Set(['a', 'b'])
    );

    expect(targets.map((t) => t.id)).toEqual(['c']);
  });

  it('keeps a page whose parent is not in the list, at the top level', () => {
    const targets = buildMoveTargets(
      [page('orphan', 'Orphan', 'gone')],
      ROOT,
      new Set()
    );

    expect(targets).toEqual([
      {
        id: 'orphan',
        name: 'Orphan',
        parentId: ROOT,
        depth: 0,
        hasChildren: false,
        path: [],
      },
    ]);
  });

  it('ignores everything that is not a page', () => {
    const targets = buildMoveTargets(
      [
        page('a', 'Alpha', ROOT),
        { id: 'db', type: 'database', name: 'Tasks', parentId: ROOT },
        { id: 'wb', type: 'whiteboard', name: 'Board', parentId: ROOT },
      ],
      ROOT,
      new Set()
    );

    expect(targets.map((t) => t.id)).toEqual(['a']);
  });
});

describe('matchMoveTargets', () => {
  const targets = buildMoveTargets(
    [
      page('a', 'Cyprus', ROOT),
      page('b', 'Noise tests', 'a'),
      page('c', 'Noise tests', ROOT),
    ],
    ROOT,
    new Set()
  );

  it('returns everything when nothing is typed', () => {
    expect(matchMoveTargets(targets, '   ')).toHaveLength(3);
  });

  it('matches on the page name', () => {
    expect(matchMoveTargets(targets, 'noise').map((t) => t.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('matches words against the path, in any order', () => {
    expect(matchMoveTargets(targets, 'noise cyprus').map((t) => t.id)).toEqual([
      'b',
    ]);
  });

  it('ignores case and accents', () => {
    const accented = buildMoveTargets(
      [page('a', 'Réunion générale', ROOT)],
      ROOT,
      new Set()
    );
    expect(matchMoveTargets(accented, 'reunion GENERALE')).toHaveLength(1);
  });
});

describe('ancestorsOf', () => {
  it('lists the folders that must be open for a match to be visible', () => {
    const targets = buildMoveTargets(
      [
        page('a', 'Cyprus', ROOT),
        page('b', 'Noise', 'a'),
        page('c', 'GW 2', 'b'),
      ],
      ROOT,
      new Set()
    );
    const byId = new Map<string, MoveTarget>(targets.map((t) => [t.id, t]));
    const deep = targets.filter((t) => t.id === 'c');

    expect([...ancestorsOf(deep, byId)].sort()).toEqual(['a', 'b']);
  });
});
