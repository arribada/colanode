import { OperationType, TransactionWithMutations } from '@tanstack/react-db';
import { cloneDeep } from 'lodash-es';

import {
  computeRecordFormulaValues,
  mapNodeAttributes,
} from '@colanode/client/lib';
import {
  LocalDatabaseNode,
  LocalNode,
  NodeCollaborator,
  NodeReaction,
} from '@colanode/client/types';
import { extractNodeCollaborators, FieldAttributes, Node } from '@colanode/core';

export const buildNodeCollaborators = (nodes: Node[]): NodeCollaborator[] => {
  const collaborators: Record<string, NodeCollaborator> = {};

  for (const node of nodes) {
    const nodeCollaborators = extractNodeCollaborators(node);

    for (const [collaboratorId, role] of Object.entries(nodeCollaborators)) {
      collaborators[collaboratorId] = {
        nodeId: node.id,
        collaboratorId,
        role,
      };
    }
  }

  return Object.values(collaborators);
};

// A record's formula columns are computed at display time, so they have no
// stored value -- which means the local-DB query behind DB views can't sort or
// filter on them. We materialise them here, at the single write funnel: every
// time THIS client creates or edits a record we recompute its formula fields
// and store the result as a real FieldValue, so sort/filter/export see it like
// any other column. The database's field definitions are cached briefly so a
// burst of writes (e.g. a grid paste) doesn't refetch per row.
const DATABASE_FIELDS_TTL = 2000;
const databaseFieldsCache = new Map<
  string,
  { fields: FieldAttributes[]; expires: number }
>();

const getDatabaseFields = async (
  userId: string,
  databaseId: string
): Promise<FieldAttributes[]> => {
  const cached = databaseFieldsCache.get(databaseId);
  if (cached && cached.expires > Date.now()) {
    return cached.fields;
  }
  const nodes = await window.colanode.executeQuery({
    type: 'node.list',
    userId,
    filters: [{ field: ['id'], operator: 'eq', value: databaseId }],
    sorts: [],
  });
  const database = nodes.find(
    (node): node is LocalDatabaseNode => node.type === 'database'
  );
  const fields = database ? Object.values(database.fields ?? {}) : [];
  databaseFieldsCache.set(databaseId, {
    fields,
    expires: Date.now() + DATABASE_FIELDS_TTL,
  });
  return fields;
};

const materializeRecordFormulas = async (
  userId: string,
  node: LocalNode
): Promise<void> => {
  if (node.type !== 'record' || !node.databaseId) {
    return;
  }
  try {
    const fields = await getDatabaseFields(userId, node.databaseId);
    if (!fields.some((field) => field.type === 'formula')) {
      return;
    }
    const values = computeRecordFormulaValues(node, fields);
    for (const field of fields) {
      if (field.type !== 'formula') {
        continue;
      }
      const computed = values[field.id];
      if (computed) {
        node.fields[field.id] = computed;
      } else if (node.fields[field.id]) {
        // Formula now evaluates to empty -- drop the stale stored value.
        delete node.fields[field.id];
      }
    }
  } catch {
    // Materialisation is best-effort: it must never block a record write.
  }
};

export const applyNodeTransaction = async (
  userId: string,
  transaction: TransactionWithMutations<LocalNode, OperationType>
) => {
  for (const mutation of transaction.mutations) {
    if (mutation.type === 'insert') {
      const node = cloneDeep(mutation.modified);
      await materializeRecordFormulas(userId, node);
      const attributes = mapNodeAttributes(node);
      await window.colanode.executeMutation({
        type: 'node.create',
        userId,
        nodeId: node.id,
        attributes,
      });
    } else if (mutation.type === 'update') {
      const node = cloneDeep(mutation.modified);
      if (node.type === 'database') {
        // A formula definition may have changed -> drop the cached field set
        // so subsequent record writes materialise with the new formula.
        databaseFieldsCache.delete(node.id);
      }
      await materializeRecordFormulas(userId, node);
      const attributes = mapNodeAttributes(node);
      await window.colanode.executeMutation({
        type: 'node.update',
        userId,
        nodeId: mutation.key,
        attributes,
      });
    } else if (mutation.type === 'delete') {
      await window.colanode.executeMutation({
        type: 'node.delete',
        userId,
        nodeId: mutation.key,
      });
    }
  }
};

export const applyNodeReactionTransaction = async (
  userId: string,
  transaction: TransactionWithMutations<NodeReaction, OperationType>
) => {
  for (const mutation of transaction.mutations) {
    if (mutation.type === 'insert') {
      const reaction = mutation.modified;
      await window.colanode.executeMutation({
        type: 'node.reaction.create',
        userId,
        nodeId: reaction.nodeId,
        collaboratorId: reaction.collaboratorId,
        reaction: reaction.reaction,
      });
    } else if (mutation.type === 'delete') {
      const reaction = mutation.modified;
      await window.colanode.executeMutation({
        type: 'node.reaction.delete',
        userId,
        nodeId: reaction.nodeId,
        collaboratorId: reaction.collaboratorId,
        reaction: reaction.reaction,
      });
    }
  }
};

export const buildNodeReactionKey = (
  nodeId: string,
  collaboratorId: string,
  reaction: string
) => {
  return `${nodeId}.${collaboratorId}.${reaction}`;
};

export const collectDescendantIds = (
  rootId: string,
  nodes: LocalNode[]
): Set<string> => {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId === null) {
      continue;
    }
    const list = childrenByParent.get(node.parentId);
    if (list) {
      list.push(node.id);
    } else {
      childrenByParent.set(node.parentId, [node.id]);
    }
  }

  const descendants = new Set<string>();
  const queue = [...(childrenByParent.get(rootId) ?? [])];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (descendants.has(id)) {
      continue;
    }
    descendants.add(id);
    const children = childrenByParent.get(id);
    if (children) {
      queue.push(...children);
    }
  }
  return descendants;
};
