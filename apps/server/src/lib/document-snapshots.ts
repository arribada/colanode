import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { SelectDocumentSnapshot } from '@colanode/server/data/schema';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('server:lib:document-snapshots');

export type DocumentSnapshotRetention = {
  // maximum number of snapshots kept per document (newest first)
  keepCount: number;
  // snapshots older than this many days are pruned
  maxAgeDays: number;
};

export const DEFAULT_DOCUMENT_SNAPSHOT_RETENTION: DocumentSnapshotRetention = {
  keepCount: 20,
  maxAgeDays: 90,
};

// Writes a snapshot of the document's current materialized content. Called
// by the document updates merge job right BEFORE compacting updates, so a
// version of the content is preserved even after the granular CRDT updates
// are merged away. Deduplicates on the document revision: if the latest
// snapshot already captured this revision, nothing is written.
export type DocumentSnapshotLabel = {
  // The version tag this snapshot was cut under, e.g. "v1.2.0".
  name?: string | null;
  // The changelog written when the version was cut.
  note?: string | null;
};

export const captureDocumentSnapshot = async (
  documentId: string,
  label?: DocumentSnapshotLabel,
  createdBy?: string
): Promise<SelectDocumentSnapshot | null> => {
  const document = await database
    .selectFrom('documents')
    .selectAll()
    .where('id', '=', documentId)
    .executeTakeFirst();

  if (!document) {
    return null;
  }

  const latestSnapshot = await database
    .selectFrom('document_snapshots')
    .select(['id', 'revision', 'name', 'note'])
    .where('document_id', '=', documentId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (latestSnapshot && latestSnapshot.revision === document.revision) {
    // Nothing has changed since the last snapshot. A version cut at this very
    // revision labels the snapshot that is already there rather than storing
    // the same content twice; the merge job, which passes no label, still does
    // nothing.
    if (!label || (label.name == null && label.note == null)) {
      return null;
    }

    const labelled = await database
      .updateTable('document_snapshots')
      .returningAll()
      .set({
        name: label.name ?? null,
        note: label.note ?? null,
      })
      .where('id', '=', latestSnapshot.id)
      .executeTakeFirst();

    return labelled ?? null;
  }

  const createdSnapshot = await database
    .insertInto('document_snapshots')
    .returningAll()
    .values({
      id: generateId(IdType.Version),
      document_id: document.id,
      workspace_id: document.workspace_id,
      revision: document.revision,
      content: JSON.stringify(document.content),
      created_at: document.updated_at ?? document.created_at,
      created_by: createdBy ?? document.updated_by ?? document.created_by,
      name: label?.name ?? null,
      note: label?.note ?? null,
    })
    .executeTakeFirst();

  if (createdSnapshot) {
    logger.debug(
      `Captured snapshot ${createdSnapshot.id} for document ${documentId} at revision ${document.revision}`
    );
  }

  return createdSnapshot ?? null;
};

// Applies the retention policy for a document's snapshots: keeps at most
// `keepCount` snapshots (newest first) and prunes everything older than
// `maxAgeDays`. Returns the number of deleted rows.
export const pruneDocumentSnapshots = async (
  documentId: string,
  retention: DocumentSnapshotRetention
): Promise<number> => {
  const cutoff = new Date(
    Date.now() - retention.maxAgeDays * 24 * 60 * 60 * 1000
  );

  const snapshotsToKeep = await database
    .selectFrom('document_snapshots')
    .select('id')
    .where('document_id', '=', documentId)
    .where('created_at', '>=', cutoff)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(retention.keepCount)
    .execute();

  const idsToKeep = snapshotsToKeep.map((snapshot) => snapshot.id);

  let deleteQuery = database
    .deleteFrom('document_snapshots')
    .where('document_id', '=', documentId)
    // A version somebody cut on purpose is never pruned. Retention exists to
    // stop the automatic captures piling up; deleting a tagged version would
    // throw away the one thing a person deliberately kept, and its changelog
    // with it.
    .where('name', 'is', null);

  if (idsToKeep.length > 0) {
    deleteQuery = deleteQuery.where('id', 'not in', idsToKeep);
  }

  const result = await deleteQuery.executeTakeFirst();
  const deleted = Number(result?.numDeletedRows ?? 0n);

  if (deleted > 0) {
    logger.debug(`Pruned ${deleted} snapshots for document ${documentId}`);
  }

  return deleted;
};
