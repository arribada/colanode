import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { SelectNodeSnapshot } from '@colanode/server/data/schema';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('server:lib:node-snapshots');

export type NodeSnapshotRetention = {
  // maximum number of snapshots kept per node (newest first)
  keepCount: number;
  // snapshots older than this many days are pruned
  maxAgeDays: number;
};

export const DEFAULT_NODE_SNAPSHOT_RETENTION: NodeSnapshotRetention = {
  keepCount: 20,
  maxAgeDays: 90,
};

// Writes a snapshot of the node's current materialized attributes. Called by
// the node updates merge job right BEFORE compacting a whiteboard node's
// updates, so a version of the board scene is preserved even after the
// granular CRDT updates are merged away. Deduplicates on the node revision: if
// the latest snapshot already captured this revision, nothing is written.
export const captureNodeSnapshot = async (
  nodeId: string
): Promise<SelectNodeSnapshot | null> => {
  const node = await database
    .selectFrom('nodes')
    .selectAll()
    .where('id', '=', nodeId)
    .executeTakeFirst();

  if (!node) {
    return null;
  }

  const latestSnapshot = await database
    .selectFrom('node_snapshots')
    .select(['id', 'revision'])
    .where('node_id', '=', nodeId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (latestSnapshot && latestSnapshot.revision === node.revision) {
    return null;
  }

  const createdSnapshot = await database
    .insertInto('node_snapshots')
    .returningAll()
    .values({
      id: generateId(IdType.Version),
      node_id: node.id,
      workspace_id: node.workspace_id,
      revision: node.revision,
      attributes: JSON.stringify(node.attributes),
      created_at: node.updated_at ?? node.created_at,
      created_by: node.updated_by ?? node.created_by,
    })
    .executeTakeFirst();

  if (createdSnapshot) {
    logger.debug(
      `Captured snapshot ${createdSnapshot.id} for node ${nodeId} at revision ${node.revision}`
    );
  }

  return createdSnapshot ?? null;
};

// Applies the retention policy for a node's snapshots: keeps at most
// `keepCount` snapshots (newest first) and prunes everything older than
// `maxAgeDays`. Returns the number of deleted rows.
export const pruneNodeSnapshots = async (
  nodeId: string,
  retention: NodeSnapshotRetention
): Promise<number> => {
  const cutoff = new Date(
    Date.now() - retention.maxAgeDays * 24 * 60 * 60 * 1000
  );

  const snapshotsToKeep = await database
    .selectFrom('node_snapshots')
    .select('id')
    .where('node_id', '=', nodeId)
    .where('created_at', '>=', cutoff)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(retention.keepCount)
    .execute();

  const idsToKeep = snapshotsToKeep.map((snapshot) => snapshot.id);

  let deleteQuery = database
    .deleteFrom('node_snapshots')
    .where('node_id', '=', nodeId);

  if (idsToKeep.length > 0) {
    deleteQuery = deleteQuery.where('id', 'not in', idsToKeep);
  }

  const result = await deleteQuery.executeTakeFirst();
  const deleted = Number(result?.numDeletedRows ?? 0n);

  if (deleted > 0) {
    logger.debug(`Pruned ${deleted} snapshots for node ${nodeId}`);
  }

  return deleted;
};
