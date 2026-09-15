import { describe, expect, it } from 'vitest';

import { generateId, IdType, NodeAttributes } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { restoreNode, trashNode } from '@colanode/server/lib/ai/tools';
import { createNode } from '@colanode/server/lib/nodes';

import {
  createAccount,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

// Alice's space, which Bob may only view. Carol is in the workspace, with a
// space of her own, and can open nothing of Alice's.
const seed = async () => {
  const alice = await createAccount({ name: 'Alice' });
  const bob = await createAccount({ name: 'Bob' });
  const carol = await createAccount({ name: 'Carol' });
  const workspace = await createWorkspace({ createdBy: alice.id });
  const userA = await createUser({
    workspaceId: workspace.id,
    account: alice,
    role: 'owner',
  });
  const userB = await createUser({
    workspaceId: workspace.id,
    account: bob,
    role: 'collaborator',
  });
  const userC = await createUser({
    workspaceId: workspace.id,
    account: carol,
    role: 'collaborator',
  });
  const space = await createSpaceNode({
    workspaceId: workspace.id,
    userId: userA.id,
    name: 'Alice',
    collaborators: { [userB.id]: 'viewer' },
  });
  await createSpaceNode({
    workspaceId: workspace.id,
    userId: userC.id,
    name: 'Carol',
  });

  const page = generateId(IdType.Page);
  const created = await createNode({
    nodeId: page,
    rootId: space,
    attributes: {
      type: 'page',
      name: 'Draft',
      parentId: space,
    } as NodeAttributes,
    userId: userA.id,
    workspaceId: workspace.id,
  });
  if (!created) {
    throw new Error('Failed to create page');
  }

  return {
    workspaceId: workspace.id,
    userA: userA.id,
    space,
    page,
    ctxA: { userId: userA.id, workspaceId: workspace.id },
    ctxB: { userId: userB.id, workspaceId: workspace.id },
    ctxC: { userId: userC.id, workspaceId: workspace.id },
  };
};

describe('what trash_node and restore_node tell someone they should not', () => {
  it('says a node was deleted for good only to someone who could open its space', async () => {
    const data = await seed();
    const gone = generateId(IdType.Page);
    await database
      .insertInto('node_tombstones')
      .values({
        id: gone,
        root_id: data.space,
        workspace_id: data.workspaceId,
        deleted_at: new Date(),
        deleted_by: data.userA,
      })
      .execute();

    await expect(restoreNode(data.ctxA, { id: gone })).rejects.toThrow(
      /permanently deleted/
    );
    // To Carol, a node deleted from a space she cannot open is just not
    // there, as is any id that never existed.
    await expect(restoreNode(data.ctxC, { id: gone })).rejects.toThrow(
      `Node ${gone} was not found.`
    );
  });

  it('refuses someone who may only view before saying a node is already trashed', async () => {
    const data = await seed();
    await trashNode(data.ctxA, { id: data.page });

    await expect(trashNode(data.ctxB, { id: data.page })).rejects.toThrow(
      /permission/
    );
    // Someone who may trash it still gets the same answer twice.
    await expect(
      trashNode(data.ctxA, { id: data.page })
    ).resolves.toMatchObject({ id: data.page, trashed: true });
  });
});
