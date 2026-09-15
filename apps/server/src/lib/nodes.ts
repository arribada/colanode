import { sql, Transaction } from 'kysely';
import { cloneDeep } from 'lodash-es';

import {
  CanCreateNodeContext,
  CanDeleteNodeContext,
  CanUpdateAttributesContext,
  CreateNodeMutationData,
  DeleteNodeMutationData,
  extractNodeCollaborators,
  extractNodeRole,
  generateId,
  getNodeModel,
  hasNodeRole,
  IdType,
  Node,
  NodeAttributes,
  MutationStatus,
  RecordAttributes,
  UpdateNodeMutationData,
} from '@colanode/core';
import { decodeState, YDoc } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';
import {
  CreateCollaboration,
  DatabaseSchema,
  SelectCollaboration,
  SelectNode,
  SelectNodeUpdate,
} from '@colanode/server/data/schema';
import {
  applyCollaboratorUpdates,
  checkCollaboratorChanges,
} from '@colanode/server/lib/collaborations';
import { eventBus } from '@colanode/server/lib/event-bus';
import { createLogger } from '@colanode/server/lib/logger';
import { reconcileBidirectionalRelations } from '@colanode/server/lib/relation-reconciler';
import {
  lockNodeRoot,
  lockRootsExclusive,
  readNodeRootId,
  RootChangedError,
} from '@colanode/server/lib/root-locks';
import { storage } from '@colanode/server/lib/storage';
import { jobService } from '@colanode/server/services/job-service';
import { WorkspaceContext } from '@colanode/server/types/api';
import {
  ConcurrentUpdateResult,
  CreateNodeInput,
  UpdateNodeInput,
} from '@colanode/server/types/nodes';

const logger = createLogger('server:lib:nodes');

const UPDATE_RETRIES_LIMIT = 10;

export const mapNode = (node: SelectNode): Node => {
  const attributes = node.attributes as NodeAttributes;
  return {
    id: node.id,
    rootId: node.root_id,
    parentId: node.parent_id,
    createdAt: node.created_at.toISOString(),
    createdBy: node.created_by,
    updatedAt: node.updated_at?.toISOString() ?? null,
    updatedBy: node.updated_by ?? null,
    ...attributes,
  };
};

export const fetchNode = async (nodeId: string): Promise<SelectNode | null> => {
  const result = await database
    .selectFrom('nodes')
    .selectAll()
    .where('id', '=', nodeId)
    .executeTakeFirst();

  return result ?? null;
};

export const fetchNodeUpdates = async (
  nodeId: string
): Promise<SelectNodeUpdate[]> => {
  const result = await database
    .selectFrom('node_updates')
    .selectAll()
    .where('node_id', '=', nodeId)
    .orderBy('id', 'desc')
    .execute();

  return result;
};

export const fetchNodeTree = async (nodeId: string): Promise<SelectNode[]> => {
  const result = await database
    .selectFrom('nodes')
    .selectAll()
    .innerJoin('node_paths', 'nodes.id', 'node_paths.ancestor_id')
    .where('node_paths.descendant_id', '=', nodeId)
    .orderBy('node_paths.level', 'desc')
    .execute();

  return result;
};

export const fetchNodeDescendants = async (
  nodeId: string
): Promise<string[]> => {
  const result = await database
    .selectFrom('node_paths')
    .select('descendant_id')
    .where('ancestor_id', '=', nodeId)
    .orderBy('level', 'asc')
    .execute();

  return result.map((row) => row.descendant_id);
};

export const createNode = async (input: CreateNodeInput): Promise<boolean> => {
  const model = getNodeModel(input.attributes.type);
  const ydoc = new YDoc();
  const update = ydoc.update(model.attributesSchema, input.attributes);

  if (!update) {
    return false;
  }

  const attributes = ydoc.getObject<NodeAttributes>();
  const attributesJson = JSON.stringify(attributes);
  const state = ydoc.getState();
  const date = new Date();
  const updateId = generateId(IdType.Update);

  const collaborationsToCreate: CreateCollaboration[] = Object.entries(
    extractNodeCollaborators(attributes)
  ).map(([userId, role]) => ({
    collaborator_id: userId,
    node_id: input.nodeId,
    workspace_id: input.workspaceId,
    role,
    created_at: new Date(),
    created_by: input.userId,
  }));

  // A node is born in its parent's space. The caller read that space before
  // this transaction, and a move committed since would leave the new node in
  // the space its parent just left, where users of the new one never see it.
  // Checked under the space lock; on a change the create is made again in the
  // parent's current space.
  const parentId =
    input.attributes.type !== 'space' && input.attributes.type !== 'chat'
      ? readParentId(input.attributes)
      : undefined;
  let rootId = input.rootId;

  for (let attempt = 0; attempt < UPDATE_RETRIES_LIMIT; attempt++) {
    try {
      const { createdCollaborations } = await database
        .transaction()
        .execute(async (trx) => {
          if (parentId) {
            await lockNodeRoot(trx, parentId, rootId);
          }

          const createdNodeUpdate = await trx
            .insertInto('node_updates')
            .returningAll()
            .values({
              id: updateId,
              node_id: input.nodeId,
              root_id: rootId,
              workspace_id: input.workspaceId,
              data: state,
              created_at: date,
              created_by: input.userId,
            })
            .executeTakeFirst();

          if (!createdNodeUpdate) {
            throw new Error('Failed to create node update');
          }

          const createdNode = await trx
            .insertInto('nodes')
            .returningAll()
            .values({
              id: input.nodeId,
              root_id: rootId,
              workspace_id: input.workspaceId,
              attributes: attributesJson,
              created_at: date,
              created_by: input.userId,
              revision: createdNodeUpdate.revision,
            })
            .executeTakeFirst();

          if (!createdNode) {
            throw new Error('Failed to create node');
          }

          let createdCollaborations: SelectCollaboration[] = [];

          if (collaborationsToCreate.length > 0) {
            createdCollaborations = await trx
              .insertInto('collaborations')
              .returningAll()
              .values(collaborationsToCreate)
              .execute();
          }

          return { createdNode, createdCollaborations };
        });

      eventBus.publish({
        type: 'node.created',
        nodeId: input.nodeId,
        rootId,
        workspaceId: input.workspaceId,
      });

      for (const createdCollaboration of createdCollaborations) {
        eventBus.publish({
          type: 'collaboration.created',
          collaboratorId: createdCollaboration.collaborator_id,
          nodeId: input.nodeId,
          workspaceId: input.workspaceId,
        });
      }

      return true;
    } catch (error) {
      if (error instanceof RootChangedError && error.currentRootId) {
        rootId = error.currentRootId;
        continue;
      }
      logger.error(error, `Failed to create node transaction`);
      return false;
    }
  }

  return false;
};

// Thrown from inside the update transaction when a move would put a node inside
// its own subtree. It has to be an exception rather than an early return because
// the check only becomes trustworthy once the transaction holds the space lock —
// by which point we are already committed to a transaction body.
class NodeCycleError extends Error {}

/** The parentId an attribute bag carries, when it carries one at all. */
const readParentId = (attributes: unknown): string | undefined => {
  if (!attributes || typeof attributes !== 'object') return undefined;
  const value = (attributes as { parentId?: unknown }).parentId;
  return typeof value === 'string' ? value : undefined;
};

/**
 * Carries a subtree into another root (space).
 *
 * Sync is streamed per root in revision order, and a client can only build a
 * node from the first update it receives for it — the create, which carries
 * the type. Re-homing an update row bumps its revision (the node_updates
 * trigger), so this must run BEFORE the move itself is recorded, and one row
 * at a time in revision order: a single UPDATE assigns the new revisions in
 * whatever order the scan visits the rows. Done the other way round, a client
 * of the new space received the move before the create, could not build the
 * node from it, and then stored the create under the old parent — an orphan
 * no sidebar shows.
 */
const relocateSubtree = async (
  trx: Transaction<DatabaseSchema>,
  input: {
    nodeId: string;
    oldRootId: string;
    newRootId: string;
    workspaceId: string;
    userId: string;
  }
): Promise<void> => {
  // node_paths carries the self row at level 0, so ancestor_id = X yields the
  // whole subtree. A move does not change who is below the moved node, so this
  // is right whether or not the new parent_id has been written yet.
  const subtree = await trx
    .selectFrom('node_paths')
    .select('descendant_id')
    .where('ancestor_id', '=', input.nodeId)
    .execute();
  const subtreeIds = subtree.map((row) => row.descendant_id);
  if (subtreeIds.length === 0) {
    return;
  }

  await trx
    .updateTable('nodes')
    .set({ root_id: input.newRootId })
    .where('id', 'in', subtreeIds)
    .execute();

  const nodeUpdates = await trx
    .selectFrom('node_updates')
    .select('id')
    .where('node_id', 'in', subtreeIds)
    .orderBy('revision', 'asc')
    .execute();
  for (const row of nodeUpdates) {
    await trx
      .updateTable('node_updates')
      .set({ root_id: input.newRootId })
      .where('id', '=', row.id)
      .execute();
  }

  // Documents are streamed per root too, and nothing re-homed them: a moved
  // page kept its body in the old space, invisible to anyone who only has the
  // new one. document_updates has no revision trigger any more (migration
  // 00028), so the new revision is assigned here, in the same order.
  const documentUpdates = await trx
    .selectFrom('document_updates')
    .select('id')
    .where('document_id', 'in', subtreeIds)
    .orderBy('revision', 'asc')
    .execute();
  for (const row of documentUpdates) {
    await sql`
      update document_updates
      set root_id = ${input.newRootId},
          revision = nextval('document_updates_revision_sequence')
      where id = ${row.id}
    `.execute(trx);
  }

  // A user who can see the OLD space but NOT the new one never receives the
  // re-homed updates (their synchronizer is scoped to the old root), so they
  // would keep a stale copy forever. Drop a tombstone in the old root for each
  // subtree node so their node-tombstones synchronizer removes it. The client
  // tombstone apply is root-guarded, so a user who has BOTH spaces ignores this
  // (their local copy already carries the new root) — see syncServerNodeDelete.
  // onConflict keeps this idempotent and lets a later real delete re-tombstone
  // the same id.
  const now = new Date();
  for (const id of subtreeIds) {
    await trx
      .insertInto('node_tombstones')
      .values({
        id,
        root_id: input.oldRootId,
        workspace_id: input.workspaceId,
        deleted_at: now,
        deleted_by: input.userId,
      })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          root_id: input.oldRootId,
          deleted_at: now,
          deleted_by: input.userId,
          revision: sql`nextval('node_tombstones_revision_sequence')`,
        })
      )
      .execute();
  }
};

/**
 * Everything a re-parenting needs before its update row is written: the space
 * lock, the cycle check, and — when the new parent lives in another root — the
 * relocation of the subtree. Returns the new root id when the node changed
 * root, null otherwise.
 */
const prepareMove = async (
  trx: Transaction<DatabaseSchema>,
  input: {
    nodeId: string;
    parentId: string;
    oldRootId: string;
    workspaceId: string;
    userId: string;
  }
): Promise<string | null> => {
  // Serialise moves against each other, in the space the node leaves AND the
  // one it enters. READ COMMITTED alone lets two moves each read a node_paths
  // that predates the other, and locking only the old space still let A (in
  // one space) go under B while B (in another) went under A: both passed the
  // cycle check and the two nodes became each other's ancestors. Moves are rare
  // enough that the locks cost nothing. See root-locks.ts for the ordering.
  //
  // The destination's root read here is not trusted yet -- a move can carry
  // the parent elsewhere before we hold the locks -- so both roots are read
  // again under them, and a change starts the update over.
  const destinationRootId = await readNodeRootId(trx, input.parentId);
  await lockRootsExclusive(
    trx,
    destinationRootId ? [input.oldRootId, destinationRootId] : [input.oldRootId]
  );

  const currentRootId = await readNodeRootId(trx, input.nodeId);
  if (currentRootId !== null && currentRootId !== input.oldRootId) {
    throw new RootChangedError(input.nodeId, input.oldRootId, currentRootId);
  }
  const currentDestinationRootId = await readNodeRootId(trx, input.parentId);
  if (currentDestinationRootId !== destinationRootId) {
    throw new RootChangedError(
      input.parentId,
      destinationRootId,
      currentDestinationRootId
    );
  }

  // node_paths carries the self row at level 0, so this single lookup rejects
  // "into itself" and "into its own descendant" alike.
  const wouldLoop = await trx
    .selectFrom('node_paths')
    .select('descendant_id')
    .where('ancestor_id', '=', input.nodeId)
    .where('descendant_id', '=', input.parentId)
    .executeTakeFirst();
  if (wouldLoop) {
    throw new NodeCycleError();
  }

  if (
    currentDestinationRootId === null ||
    currentDestinationRootId === input.oldRootId
  ) {
    return null;
  }

  await relocateSubtree(trx, {
    nodeId: input.nodeId,
    oldRootId: input.oldRootId,
    newRootId: currentDestinationRootId,
    workspaceId: input.workspaceId,
    userId: input.userId,
  });
  return currentDestinationRootId;
};

export const updateNode = async (input: UpdateNodeInput): Promise<boolean> => {
  for (let count = 0; count < UPDATE_RETRIES_LIMIT; count++) {
    const result = await tryUpdateNode(input);

    if (result.type === 'success') {
      return true;
    }

    if (result.type === 'error') {
      return false;
    }
  }

  return false;
};

export const tryUpdateNode = async (
  input: UpdateNodeInput
): Promise<ConcurrentUpdateResult<SelectNode>> => {
  const node = await fetchNode(input.nodeId);
  if (!node) {
    return { type: 'error', error: 'Node not found' };
  }

  const nodeUpdates = await fetchNodeUpdates(input.nodeId);
  const ydoc = new YDoc();
  for (const nodeUpdate of nodeUpdates) {
    ydoc.applyUpdate(nodeUpdate.data);
  }

  const currentAttributes = ydoc.getObject<NodeAttributes>();
  const updatedAttributes = input.updater(cloneDeep(currentAttributes));
  if (!updatedAttributes) {
    return { type: 'error', error: 'Failed to update node' };
  }

  const model = getNodeModel(node.type);
  const update = ydoc.update(model.attributesSchema, updatedAttributes);

  if (!update) {
    return { type: 'error', error: 'Failed to update node' };
  }

  const attributes = ydoc.getObject<NodeAttributes>();
  const attributesJson = JSON.stringify(attributes);
  const date = new Date();
  const updateId = generateId(IdType.Update);

  const collaboratorChanges = checkCollaboratorChanges(
    node.attributes,
    attributes
  );

  // Server-side callers (the wiki tools among them) move nodes through here too,
  // so a re-parenting gets the same lock, cycle check and relocation as a
  // client mutation does.
  const nextParentId = readParentId(attributes);
  const isMove =
    nextParentId !== undefined &&
    nextParentId !== readParentId(node.attributes);

  try {
    const {
      updatedNode,
      createdCollaborations,
      updatedCollaborations,
      relocatedToRoot,
    } = await database.transaction().execute(async (trx) => {
      let relocatedToRoot: string | null = null;
      if (isMove && nextParentId !== undefined) {
        relocatedToRoot = await prepareMove(trx, {
          nodeId: input.nodeId,
          parentId: nextParentId,
          oldRootId: node.root_id,
          workspaceId: node.workspace_id,
          userId: input.userId,
        });
      } else {
        // The node may sit inside a subtree being carried to another space,
        // and the row below is stamped with the root read before this
        // transaction. The revision guard does not catch that: a relocation
        // changes the root of the moved node's descendants, not their
        // revision. Wait out the move, and retry if it changed the root.
        await lockNodeRoot(trx, input.nodeId, node.root_id);
      }

      const createdNodeUpdate = await trx
        .insertInto('node_updates')
        .returningAll()
        .values({
          id: updateId,
          node_id: input.nodeId,
          root_id: relocatedToRoot ?? node.root_id,
          workspace_id: node.workspace_id,
          data: update,
          created_at: date,
          created_by: input.userId,
        })
        .executeTakeFirst();

      if (!createdNodeUpdate) {
        throw new Error('Failed to create node update');
      }

      const updatedNode = await trx
        .updateTable('nodes')
        .returningAll()
        .set({
          attributes: attributesJson,
          updated_at: date,
          updated_by: input.userId,
          revision: createdNodeUpdate.revision,
        })
        .where('id', '=', input.nodeId)
        .where('revision', '=', node.revision)
        .executeTakeFirst();

      if (!updatedNode) {
        throw new Error('Failed to update node');
      }

      const { createdCollaborations, updatedCollaborations } =
        await applyCollaboratorUpdates(
          trx,
          input.nodeId,
          input.userId,
          input.workspaceId,
          collaboratorChanges
        );

      return {
        updatedNode,
        createdCollaborations,
        updatedCollaborations,
        relocatedToRoot,
      };
    });

    eventBus.publish({
      type: 'node.updated',
      nodeId: input.nodeId,
      rootId: relocatedToRoot ?? node.root_id,
      workspaceId: input.workspaceId,
    });

    if (relocatedToRoot) {
      eventBus.publish({
        type: 'node.deleted',
        nodeId: input.nodeId,
        rootId: node.root_id,
        workspaceId: input.workspaceId,
      });
    }

    for (const createdCollaboration of createdCollaborations) {
      eventBus.publish({
        type: 'collaboration.created',
        collaboratorId: createdCollaboration.collaborator_id,
        nodeId: input.nodeId,
        workspaceId: input.workspaceId,
      });
    }

    for (const updatedCollaboration of updatedCollaborations) {
      eventBus.publish({
        type: 'collaboration.updated',
        collaboratorId: updatedCollaboration.collaborator_id,
        nodeId: input.nodeId,
        workspaceId: input.workspaceId,
      });
    }

    return {
      type: 'success',
      output: updatedNode,
    };
  } catch (error) {
    // A cycle is a decision, not a lost race: retrying cannot change it.
    if (error instanceof NodeCycleError) {
      return {
        type: 'error',
        error: 'A node cannot be moved into its own subtree',
      };
    }
    return { type: 'retry' };
  }
};

export const createNodeFromMutation = async (
  workspace: WorkspaceContext,
  mutation: CreateNodeMutationData
): Promise<MutationStatus> => {
  const existingNode = await fetchNode(mutation.nodeId);
  if (existingNode) {
    return MutationStatus.OK;
  }

  // The node was deleted if a tombstone exists for its id. A stale client that
  // still holds the node locally will keep re-pushing its queued node.create;
  // without this guard the server happily re-creates it, so a deleted page (and
  // its subtree) keeps coming back. Cross-space moves arrive as node.update
  // (relocation), never as creates, so this never blocks a relocation — and a
  // brand-new node never has a tombstone. Ack it (OK) so the client drops the
  // mutation and reconciles through the node-tombstones synchronizer.
  const tombstone = await database
    .selectFrom('node_tombstones')
    .select('id')
    .where('id', '=', mutation.nodeId)
    .executeTakeFirst();
  if (tombstone) {
    return MutationStatus.OK;
  }

  const ydoc = new YDoc(mutation.data);
  const attributes = ydoc.getObject<NodeAttributes>();
  const model = getNodeModel(attributes.type);

  let parentId: string | null = null;

  if (attributes.type !== 'space' && attributes.type !== 'chat') {
    parentId = attributes.parentId;
  }

  const collaborationsToCreate: CreateCollaboration[] = Object.entries(
    extractNodeCollaborators(attributes)
  ).map(([userId, role]) => ({
    collaborator_id: userId,
    node_id: mutation.nodeId,
    workspace_id: workspace.id,
    role,
    created_at: new Date(),
    created_by: workspace.user.id,
  }));

  for (let attempt = 0; attempt < UPDATE_RETRIES_LIMIT; attempt++) {
    const tree = parentId ? await fetchNodeTree(parentId) : [];
    const canCreateNodeContext: CanCreateNodeContext = {
      user: {
        id: workspace.user.id,
        role: workspace.user.role,
        workspaceId: workspace.id,
        accountId: workspace.user.accountId,
      },
      tree: tree.map(mapNode),
      attributes,
    };

    if (!model.canCreate(canCreateNodeContext)) {
      return MutationStatus.FORBIDDEN;
    }

    // The node joins its parent's space, as read before the transaction. A
    // move committed in between would leave the node in the space its parent
    // just left, so the parent's root is checked again under the space lock,
    // and a change starts over -- permission check included, since the parent
    // may now be in a space with other members. The parent's own root_id is
    // what its clients sync it by, so that is the root the child takes.
    const parent = tree[tree.length - 1];
    const rootId = parent?.root_id ?? mutation.nodeId;

    try {
      const { createdCollaborations } = await database
        .transaction()
        .execute(async (trx) => {
          if (parentId) {
            await lockNodeRoot(trx, parentId, rootId);
          }

          const createdNodeUpdate = await trx
            .insertInto('node_updates')
            .returningAll()
            .values({
              id: mutation.updateId,
              node_id: mutation.nodeId,
              root_id: rootId,
              workspace_id: workspace.id,
              data: ydoc.getState(),
              created_at: new Date(mutation.createdAt),
              created_by: workspace.user.id,
            })
            .executeTakeFirst();

          if (!createdNodeUpdate) {
            throw new Error('Failed to create node update');
          }

          const createdNode = await trx
            .insertInto('nodes')
            .returningAll()
            .values({
              id: mutation.nodeId,
              root_id: rootId,
              attributes: JSON.stringify(attributes),
              workspace_id: workspace.id,
              created_at: new Date(mutation.createdAt),
              created_by: workspace.user.id,
              revision: createdNodeUpdate.revision,
            })
            .executeTakeFirst();

          if (!createdNode) {
            throw new Error('Failed to create node');
          }

          let createdCollaborations: SelectCollaboration[] = [];

          if (collaborationsToCreate.length > 0) {
            createdCollaborations = await trx
              .insertInto('collaborations')
              .returningAll()
              .values(collaborationsToCreate)
              .execute();
          }

          return { createdNode, createdCollaborations };
        });

      eventBus.publish({
        type: 'node.created',
        nodeId: mutation.nodeId,
        rootId,
        workspaceId: workspace.id,
      });

      for (const createdCollaboration of createdCollaborations) {
        eventBus.publish({
          type: 'collaboration.created',
          collaboratorId: createdCollaboration.collaborator_id,
          nodeId: mutation.nodeId,
          workspaceId: workspace.id,
        });
      }

      return MutationStatus.CREATED;
    } catch (error) {
      if (error instanceof RootChangedError) {
        continue;
      }
      logger.error(error, `Failed to create node transaction`);
      return MutationStatus.INTERNAL_SERVER_ERROR;
    }
  }

  return MutationStatus.INTERNAL_SERVER_ERROR;
};

export const updateNodeFromMutation = async (
  workspace: WorkspaceContext,
  mutation: UpdateNodeMutationData
): Promise<MutationStatus> => {
  for (let count = 0; count < UPDATE_RETRIES_LIMIT; count++) {
    const existingNodeUpdate = await database
      .selectFrom('node_updates')
      .selectAll()
      .where('id', '=', mutation.updateId)
      .executeTakeFirst();

    if (existingNodeUpdate) {
      return MutationStatus.OK;
    }

    const result = await tryUpdateNodeFromMutation(workspace, mutation);

    if (result.type === 'success') {
      return result.output;
    }

    if (result.type === 'error') {
      return MutationStatus.INTERNAL_SERVER_ERROR;
    }
  }

  return MutationStatus.INTERNAL_SERVER_ERROR;
};

const tryUpdateNodeFromMutation = async (
  workspace: WorkspaceContext,
  mutation: UpdateNodeMutationData
): Promise<ConcurrentUpdateResult<MutationStatus>> => {
  const tree = await fetchNodeTree(mutation.nodeId);
  if (tree.length === 0) {
    return { type: 'success', output: MutationStatus.NOT_FOUND };
  }

  const node = tree[tree.length - 1];
  if (!node || node.id !== mutation.nodeId) {
    return { type: 'success', output: MutationStatus.NOT_FOUND };
  }

  const nodeUpdates = await fetchNodeUpdates(mutation.nodeId);
  const ydoc = new YDoc();
  for (const nodeUpdate of nodeUpdates) {
    ydoc.applyUpdate(nodeUpdate.data);
  }

  const update = decodeState(mutation.data);
  ydoc.applyUpdate(update);

  const attributes = ydoc.getObject<NodeAttributes>();
  const attributesJson = JSON.stringify(attributes);

  const canUpdateNodeContext: CanUpdateAttributesContext = {
    user: {
      id: workspace.user.id,
      role: workspace.user.role,
      workspaceId: workspace.id,
      accountId: workspace.user.accountId,
    },
    tree: tree.map(mapNode),
    node: mapNode(node),
    attributes,
  };

  const model = getNodeModel(node.type);
  if (!model.canUpdateAttributes(canUpdateNodeContext)) {
    return { type: 'success', output: MutationStatus.FORBIDDEN };
  }

  const collaboratorChanges = checkCollaboratorChanges(
    node.attributes,
    attributes
  );

  // Re-parenting is the one attribute change that can corrupt the tree rather
  // than just the node: drop a page inside its own subtree and that branch is
  // detached from the space with no path back, so nothing can render it and no
  // walk up to the root terminates. The client refuses the drag, but it judges
  // against the tree it holds — two people moving A under B and B under A within
  // the same second each pass their own check and neither has seen the other.
  const nextParentId = readParentId(attributes);
  const isMove =
    nextParentId !== undefined && nextParentId !== readParentId(node.attributes);

  // A move whose new parent lives in a different space (root) is a *relocation*:
  // the node keeps its id but its whole subtree changes root_id. root_id is a
  // plain column that node creation stamps once and nothing else ever recomputes,
  // so without this the subtree would keep pointing at the old space and sync
  // (which is scoped per root) would leave every client in a torn state. Gate it
  // on the mover holding edit rights in the destination space, mirroring the
  // same-space update check above.
  const oldRootId = node.root_id;
  if (isMove && nextParentId) {
    const destParent = await fetchNode(nextParentId);
    if (destParent && destParent.root_id !== oldRootId) {
      const destTree = await fetchNodeTree(nextParentId);
      const destRole = extractNodeRole(
        destTree.map(mapNode),
        workspace.user.id
      );
      if (!destRole || !hasNodeRole(destRole, 'editor')) {
        return { type: 'success', output: MutationStatus.FORBIDDEN };
      }
    }
  }

  try {
    const { createdCollaborations, updatedCollaborations, relocatedToRoot } =
      await database.transaction().execute(async (trx) => {
        // Cross-space relocation happens FIRST: re-homing bumps the revision of
        // every historical update, and the move has to come after all of them
        // in the new root's stream (see relocateSubtree). The node_paths
        // rebuild for the new parent still comes from the attributes update
        // below (trg_update_node_path); root_id is what no trigger touches.
        let relocatedToRoot: string | null = null;
        if (isMove && nextParentId !== undefined) {
          relocatedToRoot = await prepareMove(trx, {
            nodeId: mutation.nodeId,
            parentId: nextParentId,
            oldRootId,
            workspaceId: workspace.id,
            userId: workspace.user.id,
          });
        } else {
          // See tryUpdateNode: an edit inside a subtree being moved to another
          // space must not stamp the space the subtree is leaving.
          await lockNodeRoot(trx, mutation.nodeId, node.root_id);
        }

        const createdNodeUpdate = await trx
          .insertInto('node_updates')
          .returningAll()
          .values({
            id: mutation.updateId,
            node_id: mutation.nodeId,
            root_id: relocatedToRoot ?? node.root_id,
            workspace_id: workspace.id,
            data: update,
            created_at: new Date(mutation.createdAt),
            created_by: workspace.user.id,
          })
          .executeTakeFirst();

        if (!createdNodeUpdate) {
          throw new Error('Failed to create node update');
        }

        const updatedNode = await trx
          .updateTable('nodes')
          .returningAll()
          .set({
            attributes: attributesJson,
            updated_at: new Date(mutation.createdAt),
            updated_by: workspace.user.id,
            revision: createdNodeUpdate.revision,
          })
          .where('id', '=', mutation.nodeId)
          .where('revision', '=', node.revision)
          .executeTakeFirst();

        if (!updatedNode) {
          throw new Error('Failed to update node');
        }

        const { createdCollaborations, updatedCollaborations } =
          await applyCollaboratorUpdates(
            trx,
            mutation.nodeId,
            workspace.user.id,
            workspace.id,
            collaboratorChanges
          );

        return {
          updatedNode,
          createdCollaborations,
          updatedCollaborations,
          relocatedToRoot,
        };
      });

    // On a plain in-space update the node stayed in its root, so wake that root.
    // On a cross-space relocation wake the DESTINATION root (its node-updates
    // synchronizer carries the re-homed subtree) and emit a delete in the OLD
    // root (its node-tombstones synchronizer drops the subtree for anyone who
    // can only see the old space).
    eventBus.publish({
      type: 'node.updated',
      nodeId: mutation.nodeId,
      rootId: relocatedToRoot ?? node.root_id,
      workspaceId: workspace.id,
    });

    if (relocatedToRoot) {
      eventBus.publish({
        type: 'node.deleted',
        nodeId: mutation.nodeId,
        rootId: oldRootId,
        workspaceId: workspace.id,
      });
    }

    for (const createdCollaboration of createdCollaborations) {
      eventBus.publish({
        type: 'collaboration.created',
        collaboratorId: createdCollaboration.collaborator_id,
        nodeId: mutation.nodeId,
        workspaceId: workspace.id,
      });
    }

    for (const updatedCollaboration of updatedCollaborations) {
      eventBus.publish({
        type: 'collaboration.updated',
        collaboratorId: updatedCollaboration.collaborator_id,
        nodeId: mutation.nodeId,
        workspaceId: workspace.id,
      });
    }

    // Authoritative bidirectional-relation reconcile. Runs AFTER the primary
    // record update has committed and OUTSIDE its transaction: for every
    // bidirectional relation field on this record's database, carry the
    // add/remove of related ids onto each target record's reverse field via the
    // same server node-update path. Idempotent + best-effort, so it can neither
    // loop nor roll back the edit the user just made. A relocation is a
    // parent/root move, not a fields change, so its diff is empty and this
    // no-ops — we key the guard on the record type only.
    if (node.type === 'record' && attributes.type === 'record') {
      const prevAttributes =
        (node.attributes as NodeAttributes).type === 'record'
          ? (node.attributes as RecordAttributes)
          : undefined;
      const databaseId = attributes.databaseId ?? node.parent_id;
      if (databaseId) {
        try {
          await reconcileBidirectionalRelations({
            recordId: mutation.nodeId,
            workspaceId: workspace.id,
            userId: workspace.user.id,
            databaseId,
            prevAttributes,
            nextAttributes: attributes,
          });
        } catch (error) {
          // Never let a reconcile failure turn a successful edit into an error.
          logger.error(
            error,
            `Failed to reconcile bidirectional relations for record ${mutation.nodeId}`
          );
        }
      }
    }

    return { type: 'success', output: MutationStatus.OK };
  } catch (error) {
    // A cycle is a decision, not a lost race: retrying it would only refuse it
    // three more times before reporting a server error for a client mistake.
    if (error instanceof NodeCycleError) {
      return { type: 'success', output: MutationStatus.FORBIDDEN };
    }
    return { type: 'retry' };
  }
};

export const deleteNodeFromMutation = async (
  workspace: WorkspaceContext,
  mutation: DeleteNodeMutationData
): Promise<MutationStatus> => {
  for (let attempt = 0; attempt < UPDATE_RETRIES_LIMIT; attempt++) {
    try {
      return await tryDeleteNodeFromMutation(workspace, mutation);
    } catch (error) {
      // The node moved to another space between the read and the lock: its
      // tombstone would have gone to the space it left. Start over.
      if (error instanceof RootChangedError) {
        continue;
      }
      throw error;
    }
  }

  return MutationStatus.INTERNAL_SERVER_ERROR;
};

const tryDeleteNodeFromMutation = async (
  workspace: WorkspaceContext,
  mutation: DeleteNodeMutationData
): Promise<MutationStatus> => {
  const tree = await fetchNodeTree(mutation.nodeId);
  if (tree.length === 0) {
    return MutationStatus.OK;
  }

  const node = tree[tree.length - 1];
  if (!node || node.id !== mutation.nodeId) {
    return MutationStatus.OK;
  }

  const model = getNodeModel(node.type);
  const canDeleteNodeContext: CanDeleteNodeContext = {
    user: {
      id: workspace.user.id,
      role: workspace.user.role,
      workspaceId: workspace.id,
      accountId: workspace.user.accountId,
    },
    tree: tree.map(mapNode),
    node: mapNode(node),
  };

  if (!model.canDelete(canDeleteNodeContext)) {
    return MutationStatus.FORBIDDEN;
  }

  const { deletedNode } = await database.transaction().execute(async (trx) => {
    // The tombstone is stamped with the root read above; see lockNodeRoot.
    await lockNodeRoot(trx, mutation.nodeId, node.root_id);

    const deletedNode = await trx
      .deleteFrom('nodes')
      .returningAll()
      .where('id', '=', mutation.nodeId)
      .executeTakeFirst();

    if (!deletedNode) {
      throw new Error('Failed to delete node');
    }

    const createdTombstone = await trx
      .insertInto('node_tombstones')
      .returningAll()
      .values({
        id: node.id,
        root_id: node.root_id,
        workspace_id: node.workspace_id,
        deleted_at: new Date(mutation.deletedAt),
        deleted_by: workspace.user.id,
      })
      // A cross-space move already left a tombstone with this id (in the old
      // root). The PK is the node id, so a plain insert would collide and 500.
      // Re-home the tombstone to the node's current root and bump the revision
      // so the destination root's clients still receive the delete.
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          root_id: node.root_id,
          deleted_at: new Date(mutation.deletedAt),
          deleted_by: workspace.user.id,
          revision: sql`nextval('node_tombstones_revision_sequence')`,
        })
      )
      .executeTakeFirst();

    if (!createdTombstone) {
      throw new Error('Failed to create tombstone');
    }

    return {
      deletedNode,
    };
  });

  if (deletedNode.type === 'file') {
    const upload = await database
      .selectFrom('uploads')
      .selectAll()
      .where('file_id', '=', mutation.nodeId)
      .executeTakeFirst();

    if (upload) {
      await storage.delete(upload.path);

      await database
        .deleteFrom('uploads')
        .where('file_id', '=', mutation.nodeId)
        .execute();
    }
  }

  eventBus.publish({
    type: 'node.deleted',
    nodeId: mutation.nodeId,
    rootId: node.root_id,
    workspaceId: workspace.id,
  });

  await jobService.addJob({
    type: 'node.clean',
    nodeId: mutation.nodeId,
    parentId: node.parent_id,
    workspaceId: workspace.id,
    userId: workspace.user.id,
  });

  return MutationStatus.OK;
};
