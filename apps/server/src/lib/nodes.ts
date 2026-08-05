import { sql } from 'kysely';
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
  UpdateNodeMutationData,
} from '@colanode/core';
import { decodeState, YDoc } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';
import {
  CreateCollaboration,
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

  try {
    const { createdCollaborations } = await database
      .transaction()
      .execute(async (trx) => {
        const createdNodeUpdate = await trx
          .insertInto('node_updates')
          .returningAll()
          .values({
            id: updateId,
            node_id: input.nodeId,
            root_id: input.rootId,
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
            root_id: input.rootId,
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
      rootId: input.rootId,
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
    logger.error(error, `Failed to create node transaction`);
    return false;
  }
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

  try {
    const { updatedNode, createdCollaborations, updatedCollaborations } =
      await database.transaction().execute(async (trx) => {
        const createdNodeUpdate = await trx
          .insertInto('node_updates')
          .returningAll()
          .values({
            id: updateId,
            node_id: input.nodeId,
            root_id: node.root_id,
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
        };
      });

    eventBus.publish({
      type: 'node.updated',
      nodeId: input.nodeId,
      rootId: node.root_id,
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
  } catch {
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

  const rootId = tree[0]?.id ?? mutation.nodeId;
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

  try {
    const { createdCollaborations } = await database
      .transaction()
      .execute(async (trx) => {
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
    logger.error(error, `Failed to create node transaction`);
    return MutationStatus.INTERNAL_SERVER_ERROR;
  }
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
        if (isMove) {
          // Serialise the moves inside one space. READ COMMITTED alone would let
          // both transactions read a node_paths that predates the other, and
          // moves are rare enough that a lock costs nothing.
          await sql`select pg_advisory_xact_lock(hashtext(${node.root_id}))`.execute(
            trx
          );
          // node_paths carries the self row at level 0, so this single lookup
          // rejects "into itself" and "into its own descendant" alike.
          const wouldLoop = await trx
            .selectFrom('node_paths')
            .select('descendant_id')
            .where('ancestor_id', '=', mutation.nodeId)
            .where('descendant_id', '=', nextParentId)
            .executeTakeFirst();

          if (wouldLoop) {
            throw new NodeCycleError();
          }
        }

        const createdNodeUpdate = await trx
          .insertInto('node_updates')
          .returningAll()
          .values({
            id: mutation.updateId,
            node_id: mutation.nodeId,
            root_id: node.root_id,
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

        // Cross-space relocation. The attributes update above already changed
        // the node's generated parent_id, which fired trg_update_node_path and
        // rebuilt node_paths for the whole subtree — so the closure table is
        // correct regardless of root. What is left is root_id, which no trigger
        // touches. Re-read the destination parent's root under the same lock and
        // if it differs, carry root_id down the subtree.
        let relocatedToRoot: string | null = null;
        if (isMove && nextParentId) {
          const newParent = await trx
            .selectFrom('nodes')
            .select('root_id')
            .where('id', '=', nextParentId)
            .executeTakeFirst();

          if (newParent && newParent.root_id !== oldRootId) {
            const newRootId = newParent.root_id;

            // Subtree = the moved node + every descendant. node_paths carries the
            // self row at level 0, so ancestor_id = X yields the whole subtree.
            const subtree = await trx
              .selectFrom('node_paths')
              .select('descendant_id')
              .where('ancestor_id', '=', mutation.nodeId)
              .execute();
            const subtreeIds = subtree.map((row) => row.descendant_id);

            // Move the nodes into the new space. This UPDATE does not touch
            // parent_id, so trg_update_node_path is a no-op here (no second path
            // rebuild).
            await trx
              .updateTable('nodes')
              .set({ root_id: newRootId })
              .where('id', 'in', subtreeIds)
              .execute();

            // Re-home every update row too. The BEFORE-UPDATE revision trigger on
            // node_updates bumps each row's revision, so the destination root's
            // node-updates synchronizer re-sends the subtree and every client
            // with access to the new space relocates (or creates) it.
            await trx
              .updateTable('node_updates')
              .set({ root_id: newRootId })
              .where('node_id', 'in', subtreeIds)
              .execute();

            // A user who can see the OLD space but NOT the new one never receives
            // the re-homed updates (their synchronizer is scoped to the old root),
            // so they would keep a stale copy forever. Drop a tombstone in the old
            // root for each subtree node so their node-tombstones synchronizer
            // removes it. The client tombstone apply is root-guarded, so a user
            // who has BOTH spaces ignores this (their local copy already carries
            // the new root) — see syncServerNodeDelete. onConflict keeps this
            // idempotent and lets a later real delete re-tombstone the same id.
            const now = new Date();
            for (const id of subtreeIds) {
              await trx
                .insertInto('node_tombstones')
                .values({
                  id,
                  root_id: oldRootId,
                  workspace_id: workspace.id,
                  deleted_at: now,
                  deleted_by: workspace.user.id,
                })
                .onConflict((oc) =>
                  oc.column('id').doUpdateSet({
                    root_id: oldRootId,
                    deleted_at: now,
                    deleted_by: workspace.user.id,
                    revision: sql`nextval('node_tombstones_revision_sequence')`,
                  })
                )
                .execute();
            }

            relocatedToRoot = newRootId;
          }
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
