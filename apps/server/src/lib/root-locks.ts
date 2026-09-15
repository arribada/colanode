import { sql, Transaction } from 'kysely';

import { DatabaseSchema } from '@colanode/server/data/schema';

/*
 * Root (space) locks.
 *
 * Every node update, document update and tombstone row is stamped with the
 * root it belongs to, and clients sync each root separately. A move into
 * another space re-homes the subtree's rows; anything written with a root read
 * before that move committed stays behind in the old space, where users of the
 * new one never receive it.
 *
 * - A move holds an EXCLUSIVE lock on the moving node's root AND on the
 *   destination's root, then re-reads both under the locks.
 * - A write that stamps a root (edit, create, delete) holds a SHARED lock on
 *   the one root it read, then re-reads that root under the lock. If a move
 *   committed in between, the root has changed and the write throws
 *   RootChangedError; its caller starts over from a fresh read. While the
 *   shared lock is held no move can take that root, so the re-read root stays
 *   true until the write commits.
 *
 * Deadlocks: exclusive locks are acquired in ascending key order, as the first
 * statements of a move's transaction, before any row is written. A write takes
 * a single shared lock, first in its transaction, and never a second one — on a
 * changed root it retries rather than escalating. No holder of a root lock
 * therefore ever waits for a lower key, or for a root lock while holding rows
 * a mover needs, so no cycle can form among root locks. The locks are keyed by
 * hashtext(id), where two ids can share a key: ordering the keys, not the ids,
 * keeps the acquisition order total even then.
 */

/**
 * A node's root changed between the read a write was prepared from and the
 * lock it took: a move committed in between. Retry from a fresh read.
 */
export class RootChangedError extends Error {
  constructor(
    public readonly nodeId: string,
    public readonly expectedRootId: string | null,
    public readonly currentRootId: string | null
  ) {
    super(
      `Node ${nodeId} moved from root ${expectedRootId} to ${currentRootId}`
    );
  }
}

/** The node's root as this transaction sees it now, or null if it is gone. */
export const readNodeRootId = async (
  trx: Transaction<DatabaseSchema>,
  nodeId: string
): Promise<string | null> => {
  const row = await trx
    .selectFrom('nodes')
    .select('root_id')
    .where('id', '=', nodeId)
    .executeTakeFirst();
  return row?.root_id ?? null;
};

/** A shared lock on one root: moves of that space wait until commit. */
export const lockRootShared = async (
  trx: Transaction<DatabaseSchema>,
  rootId: string
): Promise<void> => {
  await sql`select pg_advisory_xact_lock_shared(hashtext(${rootId}))`.execute(
    trx
  );
};

/**
 * For a write about to stamp `expectedRootId` on a row of this node (or of a
 * child of it): wait out any move of that space, then check the node is still
 * in it. Must be the first thing the transaction does. Throws RootChangedError
 * when a move committed since the caller's read; a node that no longer exists
 * is left to the caller's own checks.
 */
export const lockNodeRoot = async (
  trx: Transaction<DatabaseSchema>,
  nodeId: string,
  expectedRootId: string
): Promise<void> => {
  await lockRootShared(trx, expectedRootId);
  const currentRootId = await readNodeRootId(trx, nodeId);
  if (currentRootId !== null && currentRootId !== expectedRootId) {
    throw new RootChangedError(nodeId, expectedRootId, currentRootId);
  }
};

/** Exclusive locks on the given roots, de-duplicated, in ascending key order. */
export const lockRootsExclusive = async (
  trx: Transaction<DatabaseSchema>,
  rootIds: string[]
): Promise<void> => {
  const unique = [...new Set(rootIds)];
  if (unique.length === 1) {
    await sql`select pg_advisory_xact_lock(hashtext(${unique[0]}))`.execute(
      trx
    );
    return;
  }

  const keys = await sql<{ key: number }>`
    select distinct hashtext(id) as key
    from unnest(${unique}::text[]) as id
    order by key
  `.execute(trx);
  for (const { key } of keys.rows) {
    await sql`select pg_advisory_xact_lock(${key}::int)`.execute(trx);
  }
};
