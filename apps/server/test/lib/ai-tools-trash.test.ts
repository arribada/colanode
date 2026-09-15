import { describe, expect, it } from 'vitest';

import { generateId, IdType, NodeAttributes } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import {
  listTrash,
  restoreNode,
  trashNode,
} from '@colanode/server/lib/ai/tools';
import { createNode, fetchNode } from '@colanode/server/lib/nodes';

import {
  createAccount,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const seed = async (bobRole: 'editor' | 'viewer' = 'editor') => {
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

  const shared = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userA.id,
    name: 'Shared',
    collaborators: { [userB.id]: bobRole },
  });
  const bobOnly = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userB.id,
    name: 'Bob only',
  });

  const make = async (
    type: 'page' | 'folder',
    name: string,
    parentId: string,
    rootId: string,
    userId: string
  ): Promise<string> => {
    const id = generateId(type === 'page' ? IdType.Page : IdType.Folder);
    const created = await createNode({
      nodeId: id,
      rootId,
      attributes: { type, name, parentId } as NodeAttributes,
      userId,
      workspaceId: workspace.id,
    });
    if (!created) {
      throw new Error(`Failed to create ${name}`);
    }
    return id;
  };

  const folder = await make('folder', 'Old work', shared, shared, userA.id);
  const page = await make('page', 'Draft', folder, shared, userA.id);
  const other = await make('page', 'Notes', shared, shared, userA.id);
  const secret = await make('page', 'Secret', bobOnly, bobOnly, userB.id);

  return {
    workspace,
    userA,
    userB,
    shared,
    folder,
    page,
    other,
    secret,
    ctxA: { userId: userA.id, workspaceId: workspace.id },
    ctxB: { userId: userB.id, workspaceId: workspace.id },
  };
};

const deletedAtOf = async (id: string) =>
  ((await fetchNode(id))?.attributes as { deletedAt?: string | null })
    .deletedAt ?? null;

describe('list_trash', () => {
  it('lists what is in the trash, with who trashed it and what it sits in', async () => {
    const data = await seed();
    await trashNode(data.ctxA, { id: data.page });
    await trashNode(data.ctxA, { id: data.folder });
    await trashNode(data.ctxB, { id: data.secret });

    const trash = await listTrash(data.ctxA, {});

    // Bob's private page is not Alice's to see.
    expect(trash.items.map((item) => item.id).sort()).toEqual(
      [data.page, data.folder].sort()
    );
    const page = trash.items.find((item) => item.id === data.page)!;
    const folder = trash.items.find((item) => item.id === data.folder)!;
    expect(page).toMatchObject({
      type: 'page',
      name: 'Draft',
      parentId: data.folder,
      rootId: data.shared,
      deletedBy: { id: data.userA.id, name: 'Alice' },
      trashedAncestorId: data.folder,
    });
    expect(page.path).toEqual([
      { id: data.shared, name: 'Shared', type: 'space' },
      { id: data.folder, name: 'Old work', type: 'folder' },
    ]);
    expect(folder.trashedAncestorId).toBeNull();
    expect(typeof page.deletedAt).toBe('string');
  });

  it('pages newest first with a cursor', async () => {
    const data = await seed();
    await trashNode(data.ctxA, { id: data.page });
    await trashNode(data.ctxA, { id: data.other });
    await trashNode(data.ctxA, { id: data.folder });

    const all = await listTrash(data.ctxA, {});
    const order = all.items.map((item) => item.id);
    expect(order).toHaveLength(3);
    const stamps = all.items.map((item) => item.deletedAt);
    expect([...stamps].sort().reverse()).toEqual(stamps);

    const first = await listTrash(data.ctxA, { limit: 2 });
    expect(first.items.map((item) => item.id)).toEqual(order.slice(0, 2));
    expect(first.nextCursor).not.toBeNull();
    const rest = await listTrash(data.ctxA, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(rest.items.map((item) => item.id)).toEqual(order.slice(2));
    expect(rest.nextCursor).toBeNull();
  });
});

describe('restore_node', () => {
  it('restores a node together with the trashed folder it sits in', async () => {
    const data = await seed();
    await trashNode(data.ctxA, { id: data.page });
    await trashNode(data.ctxA, { id: data.folder });
    await trashNode(data.ctxA, { id: data.other });

    const result = await restoreNode(data.ctxA, { id: data.page });

    // Restored inside a folder that stays in the trash, the page would still
    // be out of sight -- so the folder comes back with it.
    expect(result.restored).toEqual([data.folder, data.page]);
    expect(await deletedAtOf(data.page)).toBeNull();
    expect(await deletedAtOf(data.folder)).toBeNull();
    expect(await deletedAtOf(data.other)).not.toBeNull();
    expect(
      (await listTrash(data.ctxA, {})).items.map((item) => item.id)
    ).toEqual([data.other]);
  });

  it('refuses what is not in the trash, and what is gone for good', async () => {
    const data = await seed();

    await expect(restoreNode(data.ctxA, { id: data.other })).rejects.toThrow(
      /not in the trash/
    );

    const gone = generateId(IdType.Page);
    await database
      .insertInto('node_tombstones')
      .values({
        id: gone,
        root_id: data.shared,
        workspace_id: data.workspace.id,
        deleted_at: new Date(),
        deleted_by: data.userA.id,
      })
      .execute();
    await expect(restoreNode(data.ctxA, { id: gone })).rejects.toThrow(
      /permanently deleted/
    );
  });

  it('refuses a restore to someone who may only view', async () => {
    const data = await seed('viewer');
    await trashNode(data.ctxA, { id: data.other });

    await expect(restoreNode(data.ctxB, { id: data.other })).rejects.toThrow(
      /permission/
    );
    expect(await deletedAtOf(data.other)).not.toBeNull();
  });
});

describe('trash_node', () => {
  it('refuses a node type that has no trash, and a viewer', async () => {
    const data = await seed('viewer');

    await expect(trashNode(data.ctxA, { id: data.shared })).rejects.toThrow(
      /cannot be trashed/
    );
    await expect(trashNode(data.ctxB, { id: data.other })).rejects.toThrow(
      /permission/
    );
  });
});
