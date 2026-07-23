import { describe, expect, it } from 'vitest';

import {
  extractNodeCollaborators,
  extractNodeRole,
  haveNodeCollaboratorsChanged,
} from '@colanode/core/lib/nodes';
import { Node } from '@colanode/core/registry/nodes';

const makeNode = (
  id: string,
  type: string,
  parentId: string | null,
  collaborators?: Record<string, string>
): Node =>
  ({
    id,
    type,
    parentId,
    rootId: 'space1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'user1',
    updatedAt: null,
    updatedBy: null,
    name: type,
    ...(collaborators ? { collaborators } : {}),
  }) as unknown as Node;

describe('extractNodeRole ancestor climbing', () => {
  it('climbs up to a space collaborator when the page has no direct collaborators', () => {
    const space = makeNode('space1', 'space', null, { user1: 'editor' });
    const page = makeNode('page1', 'page', 'space1');

    expect(extractNodeRole([space, page], 'user1')).toBe('editor');
  });

  it('returns null when the collaborator is not found anywhere in the tree', () => {
    const space = makeNode('space1', 'space', null, { user1: 'editor' });
    const page = makeNode('page1', 'page', 'space1');

    expect(extractNodeRole([space, page], 'user2')).toBeNull();
  });

  it('honors a page-level collaborator who is not a space collaborator', () => {
    const space = makeNode('space1', 'space', null, { user1: 'admin' });
    const page = makeNode('page1', 'page', 'space1', { user2: 'viewer' });

    // user2 has no space-level access at all, only the page grants it.
    expect(extractNodeRole([space, page], 'user2')).toBe('viewer');
    expect(extractNodeRole([space], 'user2')).toBeNull();
  });

  it('honors node-level collaborators on a database and a folder as well', () => {
    const space = makeNode('space1', 'space', null, { user1: 'admin' });
    const database = makeNode('db1', 'database', 'space1', {
      user2: 'editor',
    });
    const folder = makeNode('folder1', 'folder', 'space1', {
      user3: 'collaborator',
    });

    expect(extractNodeRole([space, database], 'user2')).toBe('editor');
    expect(extractNodeRole([space, folder], 'user3')).toBe('collaborator');
  });

  it('lets the closer (more specific) node-level grant apply for a user who also has a broader ancestor grant', () => {
    const space = makeNode('space1', 'space', null, { user1: 'viewer' });
    const page = makeNode('page1', 'page', 'space1', { user1: 'editor' });

    expect(extractNodeRole([space, page], 'user1')).toBe('editor');
  });
});

describe('extractNodeCollaborators', () => {
  it('returns an empty record for node types without collaborators', () => {
    const page = makeNode('page1', 'page', 'space1');
    expect(extractNodeCollaborators(page)).toEqual({});
  });

  it('returns the collaborators record when present', () => {
    const page = makeNode('page1', 'page', 'space1', { user1: 'admin' });
    expect(extractNodeCollaborators(page)).toEqual({ user1: 'admin' });
  });
});

describe('haveNodeCollaboratorsChanged', () => {
  const base: { type: string; name: string; parentId: string } = {
    type: 'page',
    name: 'Page',
    parentId: 'space1',
  };

  it('is false when neither side has collaborators', () => {
    expect(haveNodeCollaboratorsChanged(base as never, base as never)).toBe(
      false
    );
  });

  it('is false when collaborators are identical', () => {
    const before = { ...base, collaborators: { user1: 'editor' } } as never;
    const after = { ...base, collaborators: { user1: 'editor' } } as never;

    expect(haveNodeCollaboratorsChanged(before, after)).toBe(false);
  });

  it('is true when a collaborator is added', () => {
    const before = { ...base, collaborators: { user1: 'editor' } } as never;
    const after = {
      ...base,
      collaborators: { user1: 'editor', user2: 'viewer' },
    } as never;

    expect(haveNodeCollaboratorsChanged(before, after)).toBe(true);
  });

  it('is true when a collaborator is removed', () => {
    const before = {
      ...base,
      collaborators: { user1: 'editor', user2: 'viewer' },
    } as never;
    const after = { ...base, collaborators: { user1: 'editor' } } as never;

    expect(haveNodeCollaboratorsChanged(before, after)).toBe(true);
  });

  it('is true when an existing collaborator role changes', () => {
    const before = { ...base, collaborators: { user1: 'editor' } } as never;
    const after = { ...base, collaborators: { user1: 'viewer' } } as never;

    expect(haveNodeCollaboratorsChanged(before, after)).toBe(true);
  });
});
