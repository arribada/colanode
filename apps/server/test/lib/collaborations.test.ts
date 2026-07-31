import { describe, expect, it } from 'vitest';

import { generateId, IdType } from '@colanode/core';
import { YDoc } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';
import {
  applyCollaboratorUpdates,
  checkCollaboratorChanges,
} from '@colanode/server/lib/collaborations';
import { NodeUpdatesSynchronizer } from '@colanode/server/synchronizers/node-updates';

// These tests cover the "collaboration-materialization path" for per-page
// (node-level) collaborators: a user granted access on a page who is NOT a
// collaborator on the enclosing space.
//
// Materialization (this file, first describe block): confirmed to already
// work generically. `checkCollaboratorChanges`/`applyCollaboratorUpdates`
// operate purely on the attributes diff and a `nodeId`, with no gating on
// node type, so adding `collaborators` to a page's attributes produces a
// `collaborations` row keyed by the page's own id — exactly like it already
// does for spaces.
//
// Delivery (second describe block): NOT yet supported. The realtime sync
// layer (NodeUpdatesSynchronizer and its siblings for node interactions,
// node reactions, node tombstones and document updates) resolves a
// synchronizer's `rootId` input against the `root_id` column with an exact
// equality match. `root_id` is the id of the top-level node with no parent
// (a space or a chat) — never a nested page. Meanwhile the client opens one
// of these synchronizers per active collaboration using
// `collaboration.node_id` verbatim as `rootId` (see
// `packages/client/src/services/workspaces/sync-service.ts`
// `initRootSynchronizers`). So a page-only collaboration materializes
// correctly, but nothing currently resolves `input.rootId = <pageId>`
// against the page's subtree — the query returns nothing because no
// `node_updates` row has `root_id = <pageId>`.
//
// FOLLOW-UP for the sync/access work (tracked conceptually as "syncfix"):
// NodeUpdatesSynchronizer, NodeInteractionSynchronizer,
// NodeReactionSynchronizer, NodeTombstoneSynchronizer and
// DocumentUpdateSynchronizer need to resolve their `rootId` input against
// the `node_paths` closure table (descendants of `rootId`, not an exact
// `root_id` match) so a node-level collaboration id also delivers its own
// subtree. The client also needs a way to render such a page without full
// access to its ancestor chain (breadcrumb/role currently require the
// parent nodes to exist locally).

const createNodeUpdate = async (input: {
  nodeId: string;
  rootId: string;
  workspaceId: string;
  createdBy: string;
}) => {
  const ydoc = new YDoc();
  const data = ydoc.getState();

  return database
    .insertInto('node_updates')
    .returningAll()
    .values({
      id: generateId(IdType.Update),
      node_id: input.nodeId,
      root_id: input.rootId,
      workspace_id: input.workspaceId,
      data,
      created_at: new Date(),
      created_by: input.createdBy,
      merged_updates: null,
    })
    .executeTakeFirstOrThrow();
};

describe('collaboration materialization for a page-only collaborator', () => {
  it('creates a collaborations row scoped to the page for a user who has no space-level collaboration', async () => {
    const workspaceId = generateId(IdType.Workspace);
    const adminId = generateId(IdType.User);
    const pageOnlyUserId = generateId(IdType.User);
    const spaceId = generateId(IdType.Space);
    const pageId = generateId(IdType.Page);

    const before = {
      type: 'page',
      name: 'Notes',
      parentId: spaceId,
    } as never;

    // An admin grants page-level access to a user who is not, and never
    // was, a collaborator of the enclosing space (v1 grant-only semantics:
    // this only ever adds access, it cannot revoke inherited access).
    const after = {
      type: 'page',
      name: 'Notes',
      parentId: spaceId,
      collaborators: { [pageOnlyUserId]: 'editor' },
    } as never;

    const changes = checkCollaboratorChanges(before, after);
    expect(changes.addedCollaborators).toEqual({
      [pageOnlyUserId]: 'editor',
    });
    expect(changes.updatedCollaborators).toEqual({});
    expect(changes.removedCollaborators).toEqual({});

    await database.transaction().execute(async (trx) => {
      const { createdCollaborations } = await applyCollaboratorUpdates(
        trx,
        pageId,
        adminId,
        workspaceId,
        changes
      );

      expect(createdCollaborations).toHaveLength(1);
      expect(createdCollaborations[0]?.node_id).toBe(pageId);
      expect(createdCollaborations[0]?.collaborator_id).toBe(pageOnlyUserId);
      expect(createdCollaborations[0]?.role).toBe('editor');
    });

    const stored = await database
      .selectFrom('collaborations')
      .selectAll()
      .where('node_id', '=', pageId)
      .where('collaborator_id', '=', pageOnlyUserId)
      .executeTakeFirst();

    expect(stored).toBeTruthy();
    expect(stored?.role).toBe('editor');
    expect(stored?.deleted_at).toBeNull();
  });
});

describe('node.updates synchronizer scope for a page-level collaboration (documents a follow-up gap)', () => {
  it('delivers node updates when scoped to the real tree root', async () => {
    const spaceId = generateId(IdType.Space);
    const pageId = generateId(IdType.Page);
    const workspaceId = generateId(IdType.Workspace);
    const userId = generateId(IdType.User);

    await createNodeUpdate({
      nodeId: pageId,
      rootId: spaceId,
      workspaceId,
      createdBy: userId,
    });

    const rootScoped = new NodeUpdatesSynchronizer(
      'sync-root-scope',
      {
        userId,
        workspaceId,
        accountId: generateId(IdType.Account),
        deviceId: generateId(IdType.Device),
      },
      { type: 'node.updates', rootId: spaceId },
      '0'
    );

    const output = await rootScoped.fetchData();
    expect(output?.items).toHaveLength(1);
  });

  it('does NOT yet deliver the page subtree when scoped to the page collaboration id directly', async () => {
    const spaceId = generateId(IdType.Space);
    const pageId = generateId(IdType.Page);
    const workspaceId = generateId(IdType.Workspace);
    const userId = generateId(IdType.User);

    // The page's own node_updates are stored under the enclosing space's
    // root_id, as they always are for a non-root node.
    await createNodeUpdate({
      nodeId: pageId,
      rootId: spaceId,
      workspaceId,
      createdBy: userId,
    });

    // This mirrors what the client does today for a page-only
    // collaboration: it opens a root synchronizer keyed by the
    // collaboration's own node_id (the page), not the space.
    const pageScoped = new NodeUpdatesSynchronizer(
      'sync-page-scope',
      {
        userId,
        workspaceId,
        accountId: generateId(IdType.Account),
        deviceId: generateId(IdType.Device),
      },
      { type: 'node.updates', rootId: pageId },
      '0'
    );

    const output = await pageScoped.fetchData();

    // Gap: nothing is delivered because no node_updates row has
    // root_id = pageId. See the FOLLOW-UP note at the top of this file.
    expect(output).toBeNull();
  });
});
