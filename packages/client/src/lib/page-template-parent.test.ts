// ABOUTME: Unit tests for where "New from template" may file a copy and for the
// ABOUTME: index that places the copy after every existing sibling.

import { describe, expect, it } from 'vitest';

import type { LocalNode } from '@colanode/client/types/nodes';
import { compareString, generateFractionalIndex } from '@colanode/core';

import {
  generateAppendIndex,
  getTemplateParentError,
} from './page-template-parent';

const USER = 'us_editor';

const node = (fields: Record<string, unknown>): LocalNode =>
  ({
    name: 'Node',
    createdAt: '2026-09-01T00:00:00.000Z',
    createdBy: USER,
    updatedAt: null,
    updatedBy: null,
    localRevision: '0',
    serverRevision: '0',
    ...fields,
  }) as unknown as LocalNode;

const space = (role: string | null = 'editor') =>
  node({
    id: 'sp_projects',
    type: 'space',
    rootId: 'sp_projects',
    collaborators: role ? { [USER]: role } : {},
  });

const page = (fields: Record<string, unknown> = {}) =>
  node({
    id: 'pg_turtle',
    type: 'page',
    parentId: 'sp_projects',
    rootId: 'sp_projects',
    ...fields,
  });

describe('getTemplateParentError', () => {
  it('accepts the space itself (the current menu)', () => {
    expect(
      getTemplateParentError([space()], 'sp_projects', 'sp_projects', USER)
    ).toBeNull();
  });

  it('accepts a page or folder of that space for an editor', () => {
    expect(
      getTemplateParentError(
        [space(), page()],
        'pg_turtle',
        'sp_projects',
        USER
      )
    ).toBeNull();
    expect(
      getTemplateParentError(
        [space(), page(), node({ id: 'fl_docs', type: 'folder' })],
        'fl_docs',
        'sp_projects',
        USER
      )
    ).toBeNull();
  });

  it('refuses a parent that does not exist locally', () => {
    expect(
      getTemplateParentError([], 'pg_missing', 'sp_projects', USER)
    ).toMatch(/could not be found/);
    // fetchNodeTree ending on another node is not the requested parent.
    expect(
      getTemplateParentError([space()], 'pg_missing', 'sp_projects', USER)
    ).toMatch(/could not be found/);
  });

  it('refuses node types that do not hold pages', () => {
    for (const type of ['database', 'whiteboard', 'record', 'channel']) {
      expect(
        getTemplateParentError(
          [space(), node({ id: 'xx_other', type })],
          'xx_other',
          'sp_projects',
          USER
        )
      ).toMatch(/space, page or folder/);
    }
  });

  it("refuses a parent in another space than the template's", () => {
    expect(
      getTemplateParentError(
        [space(), page()],
        'pg_turtle',
        'sp_elsewhere',
        USER
      )
    ).toMatch(/own space/);
  });

  it('refuses a parent that is, or sits inside, the trash', () => {
    expect(
      getTemplateParentError(
        [space(), page({ deletedAt: '2026-09-10T00:00:00.000Z' })],
        'pg_turtle',
        'sp_projects',
        USER
      )
    ).toMatch(/trash/);
    expect(
      getTemplateParentError(
        [
          space(),
          page({ deletedAt: '2026-09-10T00:00:00.000Z' }),
          node({ id: 'pg_child', type: 'page' }),
        ],
        'pg_child',
        'sp_projects',
        USER
      )
    ).toMatch(/trash/);
  });

  it('requires the editor role on the parent', () => {
    expect(
      getTemplateParentError(
        [space('viewer'), page()],
        'pg_turtle',
        'sp_projects',
        USER
      )
    ).toMatch(/permission/);
    expect(
      getTemplateParentError(
        [space(null), page()],
        'pg_turtle',
        'sp_projects',
        USER
      )
    ).toMatch(/permission/);
    // A node-level grant deeper in the chain overrides the space role.
    expect(
      getTemplateParentError(
        [space('viewer'), page({ collaborators: { [USER]: 'admin' } })],
        'pg_turtle',
        'sp_projects',
        USER
      )
    ).toBeNull();
    expect(
      getTemplateParentError(
        [space('admin'), page({ collaborators: { [USER]: 'viewer' } })],
        'pg_turtle',
        'sp_projects',
        USER
      )
    ).toMatch(/permission/);
  });
});

// The sidebar's ordering, as sidebar-tree-provider computes it.
const sidebarOrder = (siblings: { id: string; index?: string | null }[]) => {
  const keys = new Map<string, string>();
  let lastDefault: string | null = null;
  const byId = siblings.toSorted((a, b) => compareString(a.id, b.id));
  for (const sibling of byId) {
    lastDefault = generateFractionalIndex(lastDefault, null);
    keys.set(sibling.id, sibling.index || lastDefault);
  }
  return byId
    .toSorted((a, b) => compareString(keys.get(a.id)!, keys.get(b.id)!))
    .map((sibling) => sibling.id);
};

describe('generateAppendIndex', () => {
  it('gives a key for a parent with no children', () => {
    expect(generateAppendIndex([])).toEqual(expect.any(String));
  });

  it('lands last when its id is the newest', () => {
    const siblings = [
      { id: 'pg_01' },
      { id: 'pg_02', index: generateFractionalIndex(null, 'a0') },
      { id: 'pg_03' },
    ];
    const created = { id: 'pg_99', index: generateAppendIndex(siblings) };

    expect(sidebarOrder([...siblings, created]).at(-1)).toBe('pg_99');
  });

  it('lands after siblings that only have their default order', () => {
    const siblings = [{ id: 'pg_01' }, { id: 'pg_02' }, { id: 'pg_03' }];
    // An id that would sort FIRST by id: only the index can put it last.
    const created = { id: 'pg_00', index: generateAppendIndex(siblings) };

    expect(sidebarOrder([...siblings, created]).at(-1)).toBe('pg_00');
  });

  it('lands after a sibling dragged to the end', () => {
    const siblings = [
      { id: 'pg_01', index: generateFractionalIndex('a5', null) },
      { id: 'pg_02' },
      { id: 'pg_03', index: null },
    ];
    const created = { id: 'pg_00', index: generateAppendIndex(siblings) };

    expect(sidebarOrder([...siblings, created]).at(-1)).toBe('pg_00');
  });

  it('lands after the last default key when dragged siblings sit early', () => {
    const siblings = [
      { id: 'pg_01', index: generateFractionalIndex(null, 'a0') },
      { id: 'pg_02' },
      { id: 'pg_03' },
      { id: 'pg_04' },
    ];
    const created = { id: 'pg_00', index: generateAppendIndex(siblings) };

    expect(sidebarOrder([...siblings, created]).at(-1)).toBe('pg_00');
  });

  it('stays last when hidden children (files, trash) are counted too', () => {
    const visible = [{ id: 'pg_02' }, { id: 'pg_04' }];
    const hidden = [{ id: 'fi_01' }, { id: 'pg_03' }];
    const created = {
      id: 'pg_00',
      index: generateAppendIndex([...visible, ...hidden]),
    };

    expect(sidebarOrder([...visible, created]).at(-1)).toBe('pg_00');
  });

  it('gives up (null) instead of throwing on a malformed custom index', () => {
    expect(generateAppendIndex([{ id: 'pg_01', index: 'zzzz' }])).toBeNull();
  });
});
