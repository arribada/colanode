import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';

import { database } from '@colanode/server/data/database';
import { updateNode } from '@colanode/server/lib/nodes';

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
  const pageA = await createPageNode({
    ...base,
    parentId: spaceA,
    rootId: spaceA,
    name: 'in A',
  });
  const pageB = await createPageNode({
    ...base,
    parentId: spaceB,
    rootId: spaceB,
    name: 'in B',
  });
  return { base, spaceA, spaceB, pageA, pageB };
};

const moveTo = (
  base: { workspaceId: string; userId: string },
  nodeId: string,
  parentId: string
) =>
  updateNode({
    ...base,
    nodeId,
    updater: (attributes) => ({ ...attributes, parentId }),
  });

const until = async (condition: () => Promise<boolean>, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
};

// Number of transactions queued behind the given transaction id.
const waitersOn = async (xid: string) => {
  const result = await sql<{ count: string }>`
    select count(*) as count from pg_locks
    where locktype = 'transactionid' and not granted
      and transactionid::text = ${xid}
  `.execute(database);
  return Number(result.rows[0]?.count ?? 0);
};

// Number of transactions waiting for the advisory lock of one of these roots.
const rootLockWaiters = async (rootIds: string[]) => {
  const result = await sql<{ count: string }>`
    select count(*) as count from pg_locks l
    where l.locktype = 'advisory' and not l.granted
      and l.objid::text::bigint in (
        select hashtext(id)::bigint & 4294967295
        from unnest(${rootIds}::text[]) as id
      )
  `.execute(database);
  return Number(result.rows[0]?.count ?? 0);
};

describe('concurrent cross-space moves', () => {
  it('moving A under B and B under A from two spaces cannot make a loop', async () => {
    const { base, spaceA, spaceB, pageA, pageB } = await seed();

    // Hold both page rows so each move stops right after its cycle check.
    // Without a lock spanning both spaces, the two checks both read the tree
    // before either move, and both moves go through.
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let xid = '';
    let holding!: () => void;
    const held = new Promise<void>((resolve) => (holding = resolve));
    const blocker = database.transaction().execute(async (trx) => {
      await trx
        .selectFrom('nodes')
        .select('id')
        .where('id', 'in', [pageA, pageB])
        .forUpdate()
        .execute();
      const row = await sql<{
        xid: string;
      }>`select txid_current()::text as xid`.execute(trx);
      xid = row.rows[0]!.xid;
      holding();
      await released;
    });
    await held;

    const first = moveTo(base, pageA, pageB);
    const second = moveTo(base, pageB, pageA);

    // Both moves are in flight: one waits on the rows, the other either on the
    // rows too (no shared lock) or on the space locks.
    await until(
      async () =>
        (await waitersOn(xid)) >= 2 ||
        ((await waitersOn(xid)) >= 1 &&
          (await rootLockWaiters([spaceA, spaceB])) >= 1)
    );
    release();
    await blocker;

    const results = await Promise.all([first, second]);
    expect(results.filter(Boolean)).toHaveLength(1);

    // Neither page is its own ancestor.
    const loop = await database
      .selectFrom('node_paths')
      .select('ancestor_id')
      .where('ancestor_id', 'in', [pageA, pageB])
      .where('descendant_id', 'in', [pageA, pageB])
      .where('level', '>', 0)
      .execute();
    expect(loop).toHaveLength(1);

    // The page that moved lives in the space of its new parent.
    const nodes = await database
      .selectFrom('nodes')
      .select(['id', 'parent_id', 'root_id'])
      .where('id', 'in', [pageA, pageB])
      .execute();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    if (results[0]) {
      expect(byId.get(pageA)).toMatchObject({
        parent_id: pageB,
        root_id: spaceB,
      });
      expect(byId.get(pageB)).toMatchObject({
        parent_id: spaceB,
        root_id: spaceB,
      });
    } else {
      expect(byId.get(pageB)).toMatchObject({
        parent_id: pageA,
        root_id: spaceA,
      });
      expect(byId.get(pageA)).toMatchObject({
        parent_id: spaceA,
        root_id: spaceA,
      });
    }
  });

  it('two moves swapping pages between the same two spaces both succeed', async () => {
    const { base, spaceA, spaceB, pageA, pageB } = await seed();

    const results = await Promise.all([
      moveTo(base, pageA, spaceB),
      moveTo(base, pageB, spaceA),
    ]);
    expect(results).toEqual([true, true]);

    const nodes = await database
      .selectFrom('nodes')
      .select(['id', 'root_id'])
      .where('id', 'in', [pageA, pageB])
      .execute();
    const roots = new Map(nodes.map((node) => [node.id, node.root_id]));
    expect(roots.get(pageA)).toBe(spaceB);
    expect(roots.get(pageB)).toBe(spaceA);
  });
});
