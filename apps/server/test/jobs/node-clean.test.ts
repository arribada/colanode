import { describe, expect, it } from 'vitest';

import { database } from '@colanode/server/data/database';
import { nodeCleanHandler } from '@colanode/server/jobs/node-clean';
import { updateNode } from '@colanode/server/lib/nodes';

import {
  createAccount,
  createPageNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const tombstonesOf = (ids: string[]) =>
  database
    .selectFrom('node_tombstones')
    .select(['id', 'root_id', 'revision'])
    .where('id', 'in', ids)
    .orderBy('id')
    .execute();

describe('node clean', () => {
  it('delivers the delete of a moved subtree to the space it now lives in', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const base = { workspaceId: workspace.id, userId: user.id };
    const spaceA = await createSpaceNode({ ...base, name: 'A' });
    const spaceB = await createSpaceNode({ ...base, name: 'B' });
    const page = await createPageNode({
      ...base,
      parentId: spaceA,
      rootId: spaceA,
    });
    const child = await createPageNode({
      ...base,
      parentId: page,
      rootId: spaceA,
    });
    const grandchild = await createPageNode({
      ...base,
      parentId: child,
      rootId: spaceA,
    });

    const moved = await updateNode({
      ...base,
      nodeId: page,
      updater: (attributes) => ({ ...attributes, parentId: spaceB }),
    });
    expect(moved).toBe(true);

    // The move left a tombstone for every subtree node in the old space.
    const below = [child, grandchild];
    const before = await tombstonesOf(below);
    expect(before.map((t) => t.root_id)).toEqual([spaceA, spaceA]);

    // The delete mutation removes the page itself; node.clean what is below.
    await database.deleteFrom('nodes').where('id', '=', page).execute();
    await nodeCleanHandler({
      type: 'node.clean',
      nodeId: page,
      parentId: spaceB,
      workspaceId: workspace.id,
      userId: user.id,
    });

    const remaining = await database
      .selectFrom('nodes')
      .select('id')
      .where('id', 'in', below)
      .execute();
    expect(remaining).toHaveLength(0);

    // Clients of B hold the subtree; only a tombstone in B, newer than what
    // they have streamed, removes it from them.
    const after = await tombstonesOf(below);
    expect(after).toHaveLength(2);
    for (const [i, tombstone] of after.entries()) {
      expect(tombstone.root_id).toBe(spaceB);
      expect(BigInt(tombstone.revision)).toBeGreaterThan(
        BigInt(before[i]!.revision)
      );
    }
  });
});
