import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';

import { YDoc } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';
import { processNodeUpdates } from '@colanode/server/jobs/node-updates-merge';
import { updateNode } from '@colanode/server/lib/nodes';

import {
  createAccount,
  createPageNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const HOUR = 60 * 60 * 1000;
const MERGE_WINDOW = 3600;
const CUTOFF_WINDOW = 7200;

const updatesOf = (nodeId: string) =>
  database
    .selectFrom('node_updates')
    .selectAll()
    .where('node_id', '=', nodeId)
    .orderBy('revision', 'asc')
    .execute();

// A page with three updates (create + two renames) whose timestamps are set
// to the given offsets, without the trigger bumping their revisions.
const seedPage = async (offsets: [number, number, number]) => {
  const account = await createAccount();
  const workspace = await createWorkspace({ createdBy: account.id });
  const user = await createUser({
    workspaceId: workspace.id,
    account,
    role: 'owner',
  });
  const base = { workspaceId: workspace.id, userId: user.id };
  const space = await createSpaceNode(base);
  const page = await createPageNode({
    ...base,
    parentId: space,
    rootId: space,
    name: 'first',
  });
  for (const name of ['second', 'third']) {
    await updateNode({
      ...base,
      nodeId: page,
      updater: (attributes) => ({ ...attributes, name }),
    });
  }

  const start = Date.now() - 24 * HOUR;
  const rows = await updatesOf(page);
  expect(rows).toHaveLength(3);
  await database.transaction().execute(async (trx) => {
    await sql`set local session_replication_role = replica`.execute(trx);
    for (const [i, row] of rows.entries()) {
      await trx
        .updateTable('node_updates')
        .set({ created_at: new Date(start + offsets[i]!) })
        .where('id', '=', row.id)
        .execute();
    }
  });

  return page;
};

const firstType = (data: Uint8Array) =>
  new YDoc(data).getObject<{ type?: string }>().type;

describe('node updates merge', () => {
  it('does not merge the create into a row that would outrank later updates', async () => {
    // create and first rename close together, second rename hours later.
    const page = await seedPage([0, 10_000, 5 * HOUR]);

    await processNodeUpdates(
      page,
      await updatesOf(page),
      MERGE_WINDOW,
      CUTOFF_WINDOW
    );

    const after = await updatesOf(page);
    // Merged, the create would have taken a revision above the second rename,
    // and a fresh client would have received a rename it cannot build from.
    expect(firstType(after[0]!.data)).toBe('page');
    expect(after).toHaveLength(3);
  });

  it('still merges updates that do not hold the create', async () => {
    const page = await seedPage([0, 5 * HOUR, 5 * HOUR + 10_000]);

    await processNodeUpdates(
      page,
      await updatesOf(page),
      MERGE_WINDOW,
      CUTOFF_WINDOW
    );

    const after = await updatesOf(page);
    expect(after).toHaveLength(2);
    expect(firstType(after[0]!.data)).toBe('page');
    expect(
      new YDoc(after.map((row) => row.data)).getObject<{ name: string }>().name
    ).toBe('third');
  });

  it('merges a create group that is the whole history', async () => {
    const page = await seedPage([0, 10_000, 20_000]);

    await processNodeUpdates(
      page,
      await updatesOf(page),
      MERGE_WINDOW,
      CUTOFF_WINDOW
    );

    const after = await updatesOf(page);
    expect(after).toHaveLength(1);
    expect(firstType(after[0]!.data)).toBe('page');
  });
});
