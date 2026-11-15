import { describe, expect, it } from 'vitest';

import { DocumentContent } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import {
  nodeCleanHandler,
  withoutBlock,
} from '@colanode/server/jobs/node-clean';
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

  it('still cleans the children when the parent page has no document body', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const base = { workspaceId: workspace.id, userId: user.id };
    const space = await createSpaceNode({ ...base, name: 'Space' });
    // The parent never gets a document: no document_updates row at all, the
    // shape of an imported or never-opened page.
    const parent = await createPageNode({
      ...base,
      parentId: space,
      rootId: space,
      name: 'Parent without body',
    });
    const deleted = await createPageNode({
      ...base,
      parentId: parent,
      rootId: space,
      name: 'Deleted',
    });
    const grandchild = await createPageNode({
      ...base,
      parentId: deleted,
      rootId: space,
      name: 'Grandchild',
    });

    // The delete mutation removes the node row itself, then enqueues the job.
    await database.deleteFrom('nodes').where('id', '=', deleted).execute();

    await expect(
      nodeCleanHandler({
        type: 'node.clean',
        nodeId: deleted,
        parentId: parent,
        workspaceId: workspace.id,
        userId: user.id,
      })
    ).resolves.not.toThrow();

    const remaining = await database
      .selectFrom('nodes')
      .select('id')
      .where('id', '=', grandchild)
      .executeTakeFirst();
    expect(remaining).toBeUndefined();

    const tombstone = await database
      .selectFrom('node_tombstones')
      .select('id')
      .where('id', '=', grandchild)
      .executeTakeFirst();
    expect(tombstone?.id).toBe(grandchild);
  });
});

const paragraph = (id: string, parentId: string) => ({
  id,
  type: 'paragraph',
  parentId,
  index: 'a0',
});

describe('withoutBlock', () => {
  it('drops the block of the deleted node and keeps the others', () => {
    const content = {
      type: 'rich_text',
      blocks: {
        keep: paragraph('keep', 'doc'),
        gone: paragraph('gone', 'doc'),
      },
    } as unknown as DocumentContent;

    const result = withoutBlock(content, 'gone');

    expect(result).not.toBeNull();
    expect(Object.keys(result!.blocks)).toEqual(['keep']);
  });

  it('answers null when the block is not in the document', () => {
    const content = {
      type: 'rich_text',
      blocks: { keep: paragraph('keep', 'doc') },
    } as unknown as DocumentContent;

    expect(withoutBlock(content, 'gone')).toBeNull();
  });

  it('answers null for a parent that has no blocks yet, instead of throwing', () => {
    // What an imported or never-opened page replays to: an empty object.
    const empty = {} as DocumentContent;

    expect(() => withoutBlock(empty, 'gone')).not.toThrow();
    expect(withoutBlock(empty, 'gone')).toBeNull();
  });
});
