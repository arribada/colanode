import { sql } from 'kysely';

import { SyncDocumentUpdateData, UpdateMergeMetadata } from '@colanode/core';
import { encodeDocumentState, encodeState } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';

// A first sync used to mean replaying every edit ever made in a space. This
// builds the same result in half the bytes: one state per document, with the
// deleted content collected (see encodeDocumentState).
//
// It is paginated by document id, not by revision, so it cannot interact with
// the revision cursor at all: the client applies the states, then sets its
// cursor once to the revision this reports, and the normal stream carries on
// from there.

export interface DocumentStatesPage {
  // The highest document revision in the space when the page was read. The
  // client keeps the FIRST page's value as its cursor once it is done.
  revision: string;
  items: SyncDocumentUpdateData[];
  // The document id to continue from, or null when the space is exhausted.
  next: string | null;
}

export const fetchDocumentStates = async (input: {
  rootId: string;
  after: string | null;
  maxDocuments: number;
  maxBytes: number;
}): Promise<DocumentStatesPage> => {
  const revisionRow = await database
    .selectFrom('document_updates')
    .select(({ fn }) => fn.max('revision').as('revision'))
    .where('root_id', '=', input.rootId)
    .executeTakeFirst();

  const revision = revisionRow?.revision?.toString() ?? '0';

  let groupsQuery = database
    .selectFrom('document_updates')
    .select(({ fn }) => ['document_id', fn.max('revision').as('revision')])
    .select(sql<string>`sum(length(data))`.as('bytes'))
    .where('root_id', '=', input.rootId);

  if (input.after) {
    groupsQuery = groupsQuery.where('document_id', '>', input.after);
  }

  const groups = await groupsQuery
    .groupBy('document_id')
    .orderBy('document_id', 'asc')
    .limit(input.maxDocuments + 1)
    .execute();

  const hasMore = groups.length > input.maxDocuments;
  const candidates = hasMore ? groups.slice(0, input.maxDocuments) : groups;

  const selected: string[] = [];
  let bytes = 0;
  for (const group of candidates) {
    const groupBytes = Number(group.bytes ?? 0);
    if (selected.length > 0 && bytes + groupBytes > input.maxBytes) {
      break;
    }

    selected.push(group.document_id);
    bytes += groupBytes;
  }

  if (selected.length === 0) {
    return { revision, items: [], next: null };
  }

  const updates = await database
    .selectFrom('document_updates')
    .selectAll()
    .where('root_id', '=', input.rootId)
    .where('document_id', 'in', selected)
    .orderBy('revision', 'asc')
    .execute();

  const items: SyncDocumentUpdateData[] = [];
  for (const documentId of selected) {
    const documentUpdates = updates.filter(
      (update) => update.document_id === documentId
    );

    const last = documentUpdates[documentUpdates.length - 1];
    if (!last) {
      continue;
    }

    const state = encodeDocumentState(
      documentUpdates.map((documentUpdate) => documentUpdate.data)
    );

    // The last row's identity is kept and every row it stands for is named,
    // the way a merged row does, so a client that already holds some of them
    // can drop its copies.
    const mergedUpdates: UpdateMergeMetadata[] = [];
    for (const documentUpdate of documentUpdates) {
      for (const folded of documentUpdate.merged_updates ?? []) {
        mergedUpdates.push(folded);
      }

      if (documentUpdate.id !== last.id) {
        mergedUpdates.push({
          id: documentUpdate.id,
          createdAt: documentUpdate.created_at.toISOString(),
          createdBy: documentUpdate.created_by,
        });
      }
    }

    items.push({
      id: last.id,
      documentId,
      revision: last.revision.toString(),
      data: encodeState(state),
      createdAt: last.created_at.toISOString(),
      createdBy: last.created_by,
      mergedUpdates,
    });
  }

  const lastSelected = selected[selected.length - 1] ?? null;
  const exhausted = !hasMore && selected.length === candidates.length;

  return {
    revision,
    items,
    next: exhausted ? null : lastSelected,
  };
};
