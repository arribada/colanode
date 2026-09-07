// ABOUTME: Server-side authoritative reconciler for bidirectional relation
// ABOUTME: fields — mirrors a record's relation edits onto each target's reverse field.
import {
  DatabaseAttributes,
  NodeAttributes,
  RecordAttributes,
  RelationFieldAttributes,
  StringArrayFieldValue,
} from '@colanode/core';

import { fetchNode, updateNode } from '@colanode/server/lib/nodes';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('server:lib:relation-reconciler');

// Upper bound on how many reverse records a single primary edit may rewrite.
// One relation edit normally touches a handful of targets; the cap only exists
// so a pathological multi-hundred-id paste can never fan out unboundedly and
// stall the mutation handler. Anything beyond the cap is dropped from this pass
// (the client mirror still covers the reachable targets, and a later edit
// reconciles the rest).
const RECONCILE_TARGETS_LIMIT = 200;

const readStringArray = (value: unknown): string[] => {
  if (
    value &&
    typeof value === 'object' &&
    (value as StringArrayFieldValue).type === 'string_array' &&
    Array.isArray((value as StringArrayFieldValue).value)
  ) {
    return (value as StringArrayFieldValue).value;
  }
  return [];
};

// The record's relation value under `fieldId`, as a plain id list.
const readRelationIds = (
  attributes: NodeAttributes | undefined,
  fieldId: string
): string[] => {
  if (!attributes || attributes.type !== 'record') {
    return [];
  }
  return readStringArray(attributes.fields[fieldId]);
};

type Diff = { added: string[]; removed: string[] };

const diffIds = (prev: string[], next: string[]): Diff => {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  const added = next.filter((id) => !prevSet.has(id));
  const removed = prev.filter((id) => !nextSet.has(id));
  return { added, removed };
};

// Build the updater that adds/removes `recordId` in the reverse field's
// string_array. Returns null (a no-op update -> no write, no event) when the
// value is already in the desired state: this is what makes the reconciler
// idempotent and non-looping.
const makeReverseUpdater =
  (relatedFieldId: string, recordId: string, add: boolean) =>
  (attributes: NodeAttributes): NodeAttributes | null => {
    if (attributes.type !== 'record') {
      return null;
    }
    const current = readStringArray(attributes.fields[relatedFieldId]);
    const has = current.includes(recordId);
    if (add && has) return null;
    if (!add && !has) return null;

    const next = add
      ? [...current, recordId]
      : current.filter((id) => id !== recordId);

    // Clone the field map, then either drop the reverse field (empty) or set it.
    // An explicit clone+delete (rather than rest-destructuring) keeps this clear
    // of any noUnusedLocals concern on the server build.
    const fields = { ...attributes.fields };
    if (next.length === 0) {
      delete fields[relatedFieldId];
    } else {
      fields[relatedFieldId] = { type: 'string_array', value: next };
    }

    return { ...attributes, fields };
  };

type PlannedWrite = {
  targetRecordId: string;
  relatedFieldId: string;
  recordId: string;
  add: boolean;
};

// Pure planning step (unit-testable): given the record's database fields and the
// before/after record attributes, produce the list of reverse writes to apply.
// Applies the reverse-field guard (the reverse field must still be a relation
// whose databaseId points back at THIS record's database) and the fan-out cap.
export const planRelationReconcile = (
  recordId: string,
  databaseId: string,
  databaseFields: DatabaseAttributes['fields'],
  targetDatabases: Map<string, DatabaseAttributes>,
  prevAttributes: RecordAttributes | undefined,
  nextAttributes: RecordAttributes
): PlannedWrite[] => {
  const writes: PlannedWrite[] = [];

  for (const field of Object.values(databaseFields)) {
    if (field.type !== 'relation') continue;
    const relation = field as RelationFieldAttributes;

    const relatedFieldId = relation.relatedFieldId;
    const targetDatabaseId = relation.databaseId;
    if (!relatedFieldId || !targetDatabaseId) continue;

    // Guard: the reverse field must still be a relation on the target database
    // that points back at this record's database. A stale relatedFieldId (field
    // retyped/deleted on the other side) is ignored so we never write garbage
    // into an unrelated field.
    const targetDatabase = targetDatabases.get(targetDatabaseId);
    if (!targetDatabase) continue;
    const reverseField = targetDatabase.fields[relatedFieldId];
    if (
      !reverseField ||
      reverseField.type !== 'relation' ||
      reverseField.databaseId !== databaseId
    ) {
      continue;
    }

    const prev = readRelationIds(prevAttributes, field.id);
    const next = readRelationIds(nextAttributes, field.id);
    const { added, removed } = diffIds(prev, next);

    for (const targetRecordId of added) {
      writes.push({ targetRecordId, relatedFieldId, recordId, add: true });
    }
    for (const targetRecordId of removed) {
      writes.push({ targetRecordId, relatedFieldId, recordId, add: false });
    }
  }

  return writes.slice(0, RECONCILE_TARGETS_LIMIT);
};

/**
 * Reconcile the reverse side of every bidirectional relation on a record after
 * that record's own update has been persisted.
 *
 * Invoked (best-effort) from the record-update persistence point. Runs OUTSIDE
 * the primary transaction: each reverse write is its own optimistic-concurrency
 * node update (updateNode), so a slow or failing reverse write never rolls back
 * — or blocks — the edit the user actually made.
 *
 * Loop-safety: every reverse write is idempotent (skips when the id is already
 * in the desired state, producing no CRDT update and therefore no node.updated
 * event), and this reconciler is only ever driven by a client-pushed mutation,
 * never by the eventBus — so a reverse write can never re-enter it. Thus there
 * is no server-side recursion at all.
 *
 * Permissions: the reverse write is a derived consequence of an already-
 * authorized primary edit, so it is applied as a system-authoritative
 * updateNode (which does not re-run canUpdateAttributes) under the initiating
 * user's id, matching the client mirror's intent but making it reliable
 * regardless of which records happen to be loaded on any one client.
 */
export const reconcileBidirectionalRelations = async (input: {
  recordId: string;
  workspaceId: string;
  userId: string;
  // The record's database id (its parentId / attributes.databaseId).
  databaseId: string;
  prevAttributes: RecordAttributes | undefined;
  nextAttributes: RecordAttributes;
}): Promise<void> => {
  const { recordId, workspaceId, userId, databaseId } = input;

  // Fetch the record's own database to read its relation field definitions. If
  // the database is gone (racing delete) there is nothing to reconcile.
  const databaseNode = await fetchNode(databaseId);
  if (!databaseNode) return;
  const databaseAttributes = databaseNode.attributes as NodeAttributes;
  if (databaseAttributes.type !== 'database') return;

  // Collect the target databases referenced by bidirectional relation fields,
  // then fetch each once (deduped) so the guard can verify the reverse field.
  const targetDatabaseIds = new Set<string>();
  for (const field of Object.values(databaseAttributes.fields)) {
    if (
      field.type === 'relation' &&
      field.relatedFieldId &&
      field.databaseId
    ) {
      targetDatabaseIds.add(field.databaseId);
    }
  }
  if (targetDatabaseIds.size === 0) return;

  const targetDatabases = new Map<string, DatabaseAttributes>();
  for (const targetDatabaseId of targetDatabaseIds) {
    const targetNode = await fetchNode(targetDatabaseId);
    if (!targetNode) continue;
    const targetAttributes = targetNode.attributes as NodeAttributes;
    if (targetAttributes.type === 'database') {
      targetDatabases.set(targetDatabaseId, targetAttributes);
    }
  }

  const writes = planRelationReconcile(
    recordId,
    databaseId,
    databaseAttributes.fields,
    targetDatabases,
    input.prevAttributes,
    input.nextAttributes
  );

  for (const write of writes) {
    try {
      await updateNode({
        nodeId: write.targetRecordId,
        userId,
        workspaceId,
        updater: makeReverseUpdater(
          write.relatedFieldId,
          write.recordId,
          write.add
        ),
      });
    } catch (error) {
      // Best-effort mirror: a failed reverse write must never break the primary
      // relation edit. Log and move on; the client mirror + a later edit will
      // still reconcile the reachable side.
      logger.warn(
        error,
        `Failed to reconcile reverse relation for target ${write.targetRecordId} (field ${write.relatedFieldId})`
      );
    }
  }
};
