import { sql } from 'kysely';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DocumentContent,
  generateId,
  IdType,
  MutationStatus,
  NodeAttributes,
  pageAttributesSchema,
  WorkspaceStatus,
} from '@colanode/core';
import { encodeState, YDoc } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';
import { createDocument, updateDocument } from '@colanode/server/lib/documents';
import {
  deleteNodeFromMutation,
  updateNodeFromMutation,
} from '@colanode/server/lib/nodes';
import { jobService } from '@colanode/server/services/job-service';

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
    name: 'Moving',
  });
  const child = await createPageNode({
    ...base,
    parentId: page,
    rootId: spaceA,
    name: 'Child',
  });
  await createDocument({
    ...base,
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
  });

  const context = {
    id: workspace.id,
    status: WorkspaceStatus.Active,
    user: { id: user.id, accountId: user.account_id, role: user.role },
  };

  return { base, context, spaceA, spaceB, page, child };
};

type Seed = Awaited<ReturnType<typeof seed>>;

const until = async (condition: () => Promise<boolean>, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

// Transactions queued behind the given transaction (row locks).
const waitersOn = async (xid: string) => {
  const result = await sql<{ count: string }>`
    select count(*) as count from pg_locks
    where locktype = 'transactionid' and not granted
      and transactionid::text = ${xid}
  `.execute(database);
  return Number(result.rows[0]?.count ?? 0);
};

// Transactions waiting for the space lock of one of these roots.
const rootLockWaiters = async (rootIds: string[]) => {
  const result = await sql<{ count: string }>`
    select count(*) as count from pg_locks
    where locktype = 'advisory' and not granted
      and objid::text::bigint in (
        select hashtext(id)::bigint & 4294967295
        from unnest(${rootIds}::text[]) as id
      )
  `.execute(database);
  return Number(result.rows[0]?.count ?? 0);
};

/**
 * Runs `write` while a move of `page` (and `child`) from space A to space B is
 * in flight: the stand-in move holds the space locks a move holds and has
 * re-homed the subtree, but has not committed. Once `write` is waiting on the
 * move (or has finished without waiting), the move commits.
 */
const duringMove = async <T>(data: Seed, write: () => Promise<T>) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let ready!: (xid: string) => void;
  const readyWithXid = new Promise<string>((resolve) => (ready = resolve));

  const move = database.transaction().execute(async (trx) => {
    for (const rootId of [data.spaceA, data.spaceB]) {
      await sql`select pg_advisory_xact_lock(hashtext(${rootId}))`.execute(trx);
    }
    const ids = [data.page, data.child];
    await trx
      .updateTable('nodes')
      .set({ root_id: data.spaceB })
      .where('id', 'in', ids)
      .execute();
    await trx
      .updateTable('node_updates')
      .set({ root_id: data.spaceB })
      .where('node_id', 'in', ids)
      .execute();
    await sql`
      update document_updates
      set root_id = ${data.spaceB},
          revision = nextval('document_updates_revision_sequence')
      where document_id = ${data.page}
    `.execute(trx);
    const row = await sql<{
      xid: string;
    }>`select txid_current()::text as xid`.execute(trx);
    ready(row.rows[0]!.xid);
    await released;
  });

  const xid = await readyWithXid;
  let settled = false;
  const pending = write().finally(() => {
    settled = true;
  });

  await until(
    async () =>
      settled ||
      (await rootLockWaiters([data.spaceA, data.spaceB])) > 0 ||
      (await waitersOn(xid)) > 0
  );
  const finishedBeforeMove = settled;
  release();
  await move;

  return { result: await pending, finishedBeforeMove };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('writes racing a cross-space move', () => {
  it('a document edit lands in the space the page is moving to', async () => {
    const data = await seed();

    const { result, finishedBeforeMove } = await duringMove(data, () =>
      updateDocument({
        ...data.base,
        documentId: data.page,
        updater: (content: DocumentContent) => ({
          ...content,
          blocks: {
            ...(content.blocks ?? {}),
            b2: {
              id: 'b2',
              type: 'paragraph',
              parentId: data.page,
              index: 'a1',
              content: [{ type: 'text', text: 'typed during the move' }],
            },
          },
        }),
      })
    );

    expect(finishedBeforeMove).toBe(false);
    expect(result).toBe(true);

    const rows = await database
      .selectFrom('document_updates')
      .select('root_id')
      .where('document_id', '=', data.page)
      .execute();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.root_id)).toEqual([data.spaceB, data.spaceB]);
  });

  it('an edit of a node inside the moving subtree lands in the new space', async () => {
    const data = await seed();

    const history = await database
      .selectFrom('node_updates')
      .select('data')
      .where('node_id', '=', data.child)
      .orderBy('revision', 'asc')
      .execute();
    const ydoc = new YDoc(history.map((row) => row.data));
    const update = ydoc.update(pageAttributesSchema, {
      ...ydoc.getObject<NodeAttributes>(),
      name: 'renamed during the move',
    });
    expect(update).not.toBeNull();
    const updateId = generateId(IdType.Update);

    const { result } = await duringMove(data, () =>
      updateNodeFromMutation(data.context, {
        nodeId: data.child,
        updateId,
        data: encodeState(update!),
        createdAt: new Date().toISOString(),
      })
    );

    expect(result).toBe(MutationStatus.OK);
    const row = await database
      .selectFrom('node_updates')
      .select('root_id')
      .where('id', '=', updateId)
      .executeTakeFirstOrThrow();
    expect(row.root_id).toBe(data.spaceB);
  });

  it('a page created under the moving page is born in the new space', async () => {
    const data = await seed();

    const { result: created } = await duringMove(data, () =>
      createPageNode({
        ...data.base,
        parentId: data.page,
        rootId: data.spaceA,
        name: 'created during the move',
      })
    );

    const node = await database
      .selectFrom('nodes')
      .select('root_id')
      .where('id', '=', created)
      .executeTakeFirstOrThrow();
    expect(node.root_id).toBe(data.spaceB);
    const updates = await database
      .selectFrom('node_updates')
      .select('root_id')
      .where('node_id', '=', created)
      .execute();
    expect(updates.map((row) => row.root_id)).toEqual([data.spaceB]);
  });

  it('deleting a node of the moving subtree tombstones it in the new space', async () => {
    const data = await seed();
    vi.spyOn(jobService, 'addJob').mockResolvedValue(undefined);

    const { result } = await duringMove(data, () =>
      deleteNodeFromMutation(data.context, {
        nodeId: data.child,
        rootId: data.spaceA,
        deletedAt: new Date().toISOString(),
      })
    );

    expect(result).toBe(MutationStatus.OK);
    const tombstone = await database
      .selectFrom('node_tombstones')
      .select('root_id')
      .where('id', '=', data.child)
      .executeTakeFirstOrThrow();
    expect(tombstone.root_id).toBe(data.spaceB);
  });
});
