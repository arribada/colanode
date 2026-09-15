import { sql } from 'kysely';
import type { MockInstance } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  generateId,
  IdType,
  MutationStatus,
  NodeAttributes,
  pageAttributesSchema,
  WorkspaceStatus,
} from '@colanode/core';
import { encodeState, YDoc } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';
import { moveNode } from '@colanode/server/lib/ai/tools';
import { createDocument } from '@colanode/server/lib/documents';
import { eventBus } from '@colanode/server/lib/event-bus';
import { updateNode, updateNodeFromMutation } from '@colanode/server/lib/nodes';

import {
  createAccount,
  createPageNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const seed = async () => {
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
    name: 'Moved',
  });
  const child = await createPageNode({
    ...base,
    parentId: page,
    rootId: spaceA,
    name: 'Child',
  });

  // History on both nodes, so there is an order to preserve.
  for (const nodeId of [page, child]) {
    await updateNode({
      ...base,
      nodeId,
      updater: (attributes) => ({ ...attributes, name: `${nodeId} renamed` }),
    });
  }

  await scrambleDiskOrder(page);
  await scrambleDiskOrder(child);

  await createDocument({
    nodeId: page,
    content: {
      type: 'rich_text',
      blocks: {
        b1: {
          id: 'b1',
          type: 'paragraph',
          parentId: page,
          index: 'a0',
          content: [{ type: 'text', text: 'body' }],
        },
      },
    },
    userId: user.id,
    workspaceId: workspace.id,
  });

  return { workspace, user, spaceA, spaceB, page, child };
};

// Real tables do not keep update rows in revision order on disk: merges and
// earlier re-homes rewrite tuples. A single UPDATE of all of a node's rows
// hands out new revisions in scan order, which is how production ended up with
// moves ahead of creates. Re-insert the create with its own revision, so its
// tuple and its index entries sit after the later updates -- whether the
// planner scans the heap or the node_id index -- while it is still first by
// revision.
const scrambleDiskOrder = async (nodeId: string) => {
  await database.transaction().execute(async (trx) => {
    const create = await trx
      .selectFrom('node_updates')
      .selectAll()
      .where('node_id', '=', nodeId)
      .orderBy('revision', 'asc')
      .limit(1)
      .executeTakeFirstOrThrow();
    await trx.deleteFrom('node_updates').where('id', '=', create.id).execute();
    await sql`
      insert into node_updates
        (id, node_id, root_id, workspace_id, revision, data, merged_updates, created_at, created_by)
      values
        (${create.id}, ${create.node_id}, ${create.root_id}, ${create.workspace_id},
         ${create.revision}, ${create.data}, ${create.merged_updates}, ${create.created_at},
         ${create.created_by})
    `.execute(trx);
  });
};

const updatesOf = (nodeId: string) =>
  database
    .selectFrom('node_updates')
    .selectAll()
    .where('node_id', '=', nodeId)
    .orderBy('revision', 'asc')
    .execute();

// What a fresh client does: build the node from the FIRST update it receives
// for it. Without a type in that update it cannot create the node at all.
const typeFromFirstUpdate = (data: Uint8Array): unknown =>
  new YDoc(data).getObject<{ type?: unknown }>().type;

const expectRelocated = async (
  data: Awaited<ReturnType<typeof seed>>,
  before: { page: string[]; child: string[]; docRevision: bigint }
) => {
  const pageUpdates = await updatesOf(data.page);
  const childUpdates = await updatesOf(data.child);

  for (const row of [...pageUpdates, ...childUpdates]) {
    expect(row.root_id).toBe(data.spaceB);
  }

  // The create still comes first, the history keeps its order, and the move
  // is the last thing a client of the new space receives.
  expect(typeFromFirstUpdate(pageUpdates[0]!.data)).toBe('page');
  expect(typeFromFirstUpdate(childUpdates[0]!.data)).toBe('page');
  expect(pageUpdates.slice(0, before.page.length).map((u) => u.id)).toEqual(
    before.page
  );
  expect(childUpdates.map((u) => u.id)).toEqual(before.child);
  expect(pageUpdates).toHaveLength(before.page.length + 1);
  const move = pageUpdates[pageUpdates.length - 1]!;
  expect(
    new YDoc(pageUpdates.map((u) => u.data)).getObject<NodeAttributes>()
  ).toMatchObject({ parentId: data.spaceB });

  // A parent reaches the new space before its children.
  expect(BigInt(pageUpdates[0]!.revision)).toBeLessThan(
    BigInt(childUpdates[0]!.revision)
  );
  expect(BigInt(move.revision)).toBeGreaterThan(
    BigInt(childUpdates[childUpdates.length - 1]!.revision)
  );

  // The page body follows the page, with a revision the new space has not
  // streamed yet.
  const documentUpdates = await database
    .selectFrom('document_updates')
    .selectAll()
    .where('document_id', '=', data.page)
    .execute();
  expect(documentUpdates.length).toBeGreaterThan(0);
  for (const row of documentUpdates) {
    expect(row.root_id).toBe(data.spaceB);
    expect(BigInt(row.revision)).toBeGreaterThan(before.docRevision);
  }

  const nodes = await database
    .selectFrom('nodes')
    .select(['id', 'root_id'])
    .where('id', 'in', [data.page, data.child])
    .execute();
  expect(nodes.map((n) => n.root_id)).toEqual([data.spaceB, data.spaceB]);

  const tombstones = await database
    .selectFrom('node_tombstones')
    .select(['id', 'root_id'])
    .where('id', 'in', [data.page, data.child])
    .execute();
  expect(tombstones).toHaveLength(2);
  for (const tombstone of tombstones) {
    expect(tombstone.root_id).toBe(data.spaceA);
  }

  return move;
};

const snapshot = async (data: Awaited<ReturnType<typeof seed>>) => {
  const documentUpdate = await database
    .selectFrom('document_updates')
    .select('revision')
    .where('document_id', '=', data.page)
    .orderBy('revision', 'desc')
    .executeTakeFirstOrThrow();
  return {
    page: (await updatesOf(data.page)).map((u) => u.id),
    child: (await updatesOf(data.child)).map((u) => u.id),
    docRevision: BigInt(documentUpdate.revision),
  };
};

// The re-homed body has new revisions in the destination, and live clients of
// that space only fetch it when their document synchronizer is woken.
const expectDocumentWakeUp = (
  publish: MockInstance<typeof eventBus.publish>,
  data: Awaited<ReturnType<typeof seed>>
) => {
  expect(publish).toHaveBeenCalledWith({
    type: 'document.update.created',
    documentId: data.page,
    rootId: data.spaceB,
    workspaceId: data.workspace.id,
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cross-space move', () => {
  it('re-homes the history before recording the move (client mutation)', async () => {
    const data = await seed();
    const before = await snapshot(data);

    const ydoc = new YDoc((await updatesOf(data.page)).map((u) => u.data));
    const current = ydoc.getObject<NodeAttributes>();
    const update = ydoc.update(pageAttributesSchema, {
      ...current,
      parentId: data.spaceB,
    });
    expect(update).not.toBeNull();

    const updateId = generateId(IdType.Update);
    const publish = vi.spyOn(eventBus, 'publish');
    const status = await updateNodeFromMutation(
      {
        id: data.workspace.id,
        status: WorkspaceStatus.Active,
        user: {
          id: data.user.id,
          accountId: data.user.account_id,
          role: data.user.role,
        },
      },
      {
        nodeId: data.page,
        updateId,
        data: encodeState(update!),
        createdAt: new Date().toISOString(),
      }
    );
    expect(status).toBe(MutationStatus.OK);

    const move = await expectRelocated(data, before);
    expect(move.id).toBe(updateId);
    expectDocumentWakeUp(publish, data);
  });

  it('re-homes the history before recording the move (move_node tool)', async () => {
    const data = await seed();
    const before = await snapshot(data);
    const publish = vi.spyOn(eventBus, 'publish');

    await moveNode(
      { userId: data.user.id, workspaceId: data.workspace.id },
      { id: data.page, parentId: data.spaceB }
    );

    await expectRelocated(data, before);
    expectDocumentWakeUp(publish, data);
  });

  it('refuses to move a node into its own subtree', async () => {
    const data = await seed();

    const moved = await updateNode({
      nodeId: data.page,
      userId: data.user.id,
      workspaceId: data.workspace.id,
      updater: (attributes) => ({ ...attributes, parentId: data.child }),
    });

    expect(moved).toBe(false);
    const page = await database
      .selectFrom('nodes')
      .select('parent_id')
      .where('id', '=', data.page)
      .executeTakeFirstOrThrow();
    expect(page.parent_id).toBe(data.spaceA);
  });
});
