import { describe, expect, it } from 'vitest';

import { generateId, IdType, NodeAttributes } from '@colanode/core';
import { searchPages } from '@colanode/server/lib/ai/tools';
import { createNode, updateNode } from '@colanode/server/lib/nodes';

import {
  createAccount,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const seed = async () => {
  const accountA = await createAccount({ name: 'Alice' });
  const accountB = await createAccount({ name: 'Bob' });
  const workspace = await createWorkspace({ createdBy: accountA.id });
  const userA = await createUser({
    workspaceId: workspace.id,
    account: accountA,
    role: 'owner',
  });
  const userB = await createUser({
    workspaceId: workspace.id,
    account: accountB,
    role: 'collaborator',
  });

  // Two collaborators on the shared space, so a join on collaborations would
  // list each match twice.
  const shared = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userA.id,
    name: 'Shared',
    collaborators: { [userB.id]: 'editor' },
  });
  const bobOnly = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userB.id,
    name: 'Bob only',
  });

  const make = async (
    type: 'page' | 'folder' | 'whiteboard',
    name: string,
    parentId: string,
    options: { rootId?: string; userId?: string; isTemplate?: boolean } = {}
  ): Promise<string> => {
    const id = generateId(
      type === 'page'
        ? IdType.Page
        : type === 'folder'
          ? IdType.Folder
          : IdType.Whiteboard
    );
    const attributes = {
      type,
      name,
      parentId,
      ...(options.isTemplate ? { isTemplate: true } : {}),
    } as NodeAttributes;
    const created = await createNode({
      nodeId: id,
      rootId: options.rootId ?? shared,
      attributes,
      userId: options.userId ?? userA.id,
      workspaceId: workspace.id,
    });
    if (!created) {
      throw new Error(`Failed to create ${type} ${name}`);
    }
    return id;
  };

  const archive = await make('folder', 'Archive', shared);
  await make('page', 'Energy old plan', archive);
  await updateNode({
    nodeId: archive,
    userId: userA.id,
    workspaceId: workspace.id,
    updater: (attributes) => ({
      ...attributes,
      deletedAt: new Date().toISOString(),
      deletedBy: userA.id,
    }),
  });

  await make('page', 'Energy budget', shared);
  await make('page', 'energy Antenna', shared);
  await make('whiteboard', 'Energy board', shared);
  await make('page', 'Energy template', shared, { isTemplate: true });
  await make('page', '100% done', shared);
  await make('page', 'a_b notes', shared);
  const docParent = await make('page', 'Doc parent', shared);
  const docChild = await make('page', 'Doc child', docParent);
  await make('page', 'Doc grandchild', docChild);
  await make('page', 'Energy secret', bobOnly, {
    rootId: bobOnly,
    userId: userB.id,
  });

  return {
    ctx: { userId: userA.id, workspaceId: workspace.id },
    shared,
    bobOnly,
    docParent,
    docChild,
  };
};

const names = (result: { items: { name: string }[] }) =>
  result.items.map((item) => item.name);

describe('search_pages', () => {
  it('finds each readable match once, in name order, whiteboards included', async () => {
    const data = await seed();

    const result = await searchPages(data.ctx, { query: 'energy' });

    // Not the page inside the trashed folder, not the template, not Bob's.
    expect(names(result)).toEqual([
      'energy Antenna',
      'Energy board',
      'Energy budget',
    ]);
    expect(
      result.items.find((item) => item.name === 'Energy board')?.type
    ).toBe('whiteboard');
    expect(result.truncated).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('includes what sits in the trash only when asked', async () => {
    const data = await seed();

    const result = await searchPages(data.ctx, {
      query: 'energy',
      includeTrashed: true,
    });

    expect(names(result)).toEqual([
      'energy Antenna',
      'Energy board',
      'Energy budget',
      'Energy old plan',
    ]);
  });

  it('pages with a cursor', async () => {
    const data = await seed();

    const first = await searchPages(data.ctx, { query: 'energy', limit: 2 });
    expect(names(first)).toEqual(['energy Antenna', 'Energy board']);
    expect(first.truncated).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await searchPages(data.ctx, {
      query: 'energy',
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(names(second)).toEqual(['Energy budget']);
    expect(second.truncated).toBe(false);
    expect(second.nextCursor).toBeNull();
  });

  it('treats % and _ in the query as text', async () => {
    const data = await seed();

    expect(names(await searchPages(data.ctx, { query: '%' }))).toEqual([
      '100% done',
    ]);
    expect(names(await searchPages(data.ctx, { query: '_' }))).toEqual([
      'a_b notes',
    ]);
  });

  it('narrows to a parent, its direct children or its whole subtree', async () => {
    const data = await seed();

    const children = await searchPages(data.ctx, {
      query: 'doc',
      parentId: data.docParent,
      scope: 'children',
    });
    expect(names(children)).toEqual(['Doc child']);

    const descendants = await searchPages(data.ctx, {
      query: 'doc',
      parentId: data.docParent,
    });
    expect(names(descendants)).toEqual(['Doc child', 'Doc grandchild']);

    const grandchild = descendants.items[1]!;
    expect(grandchild.parentId).toBe(data.docChild);
    expect(grandchild.rootId).toBe(data.shared);
    expect(grandchild.path).toEqual([
      { id: data.shared, name: 'Shared', type: 'space' },
      { id: data.docParent, name: 'Doc parent', type: 'page' },
      { id: data.docChild, name: 'Doc child', type: 'page' },
    ]);
  });

  it('filters by type and by space', async () => {
    const data = await seed();

    expect(
      names(
        await searchPages(data.ctx, { query: 'energy', types: ['whiteboard'] })
      )
    ).toEqual(['Energy board']);
    expect(
      names(
        await searchPages(data.ctx, { query: 'energy', rootId: data.shared })
      )
    ).toHaveLength(3);
    expect(
      names(
        await searchPages(data.ctx, { query: 'energy', rootId: data.bobOnly })
      )
    ).toEqual([]);
  });
});
