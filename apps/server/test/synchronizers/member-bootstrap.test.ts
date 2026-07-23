import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { generateId, IdType, NodeAttributes } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { createNode } from '@colanode/server/lib/nodes';
import { jobService } from '@colanode/server/services/job-service';
import { CollaborationSynchronizer } from '@colanode/server/synchronizers/collaborations';
import { NodeUpdatesSynchronizer } from '@colanode/server/synchronizers/node-updates';

import { buildTestApp } from '../helpers/app';
import {
  buildAuthHeader,
  createAccount,
  createDevice,
  createPageNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const app = buildTestApp();

beforeAll(async () => {
  // The test app does not initialize the BullMQ job queue; the invitation
  // email job is irrelevant to this suite.
  vi.spyOn(jobService, 'addJob').mockResolvedValue(undefined);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const createSpace = async (input: {
  workspaceId: string;
  userId: string;
  name: string;
  visibility: 'public' | 'private';
}): Promise<string> => {
  const spaceId = generateId(IdType.Space);
  const attributes: NodeAttributes = {
    type: 'space',
    name: input.name,
    description: null,
    avatar: null,
    visibility: input.visibility,
    collaborators: {
      [input.userId]: 'admin',
    },
  };

  const created = await createNode({
    nodeId: spaceId,
    rootId: spaceId,
    attributes,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  if (!created) {
    throw new Error('Failed to create space node');
  }

  return spaceId;
};

describe('member bootstrap: late-added members receive existing content', () => {
  it('adding a member grants public space collaborations and sync delivers the nodes', async () => {
    // 1. Owner creates a workspace with content: a public space with pages
    // and a private space, all BEFORE the member exists.
    const ownerAccount = await createAccount({
      email: `owner-${generateId(IdType.Account)}@example.com`,
      password: 'Password123!',
    });
    const workspace = await createWorkspace({ createdBy: ownerAccount.id });
    const owner = await createUser({
      workspaceId: workspace.id,
      account: ownerAccount,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: ownerAccount.id });

    const publicSpaceId = await createSpace({
      workspaceId: workspace.id,
      userId: owner.id,
      name: 'Wiki',
      visibility: 'public',
    });
    const publicPageId = await createPageNode({
      workspaceId: workspace.id,
      userId: owner.id,
      parentId: publicSpaceId,
      rootId: publicSpaceId,
      name: 'Welcome',
    });

    const privateSpaceId = await createSpace({
      workspaceId: workspace.id,
      userId: owner.id,
      name: 'Secret',
      visibility: 'private',
    });
    await createPageNode({
      workspaceId: workspace.id,
      userId: owner.id,
      parentId: privateSpaceId,
      rootId: privateSpaceId,
      name: 'Hidden',
    });

    // 2. Owner adds a member (workspace role collaborator) AFTER the content
    // already exists.
    const memberEmail = `member-${generateId(IdType.Account)}@example.com`;
    const response = await app.inject({
      method: 'POST',
      url: `/client/v1/workspaces/${workspace.id}/users`,
      headers: buildAuthHeader(token),
      body: {
        users: [{ email: memberEmail, role: 'collaborator' }],
      },
    });

    expect(response.statusCode).toBe(200);
    const output = response.json();
    expect(output.errors).toHaveLength(0);
    expect(output.users).toHaveLength(1);
    const memberId = output.users[0].id as string;

    // 3. The member must have a collaboration on the public space only.
    const collaborations = await database
      .selectFrom('collaborations')
      .selectAll()
      .where('collaborator_id', '=', memberId)
      .execute();

    const publicCollaboration = collaborations.find(
      (c) => c.node_id === publicSpaceId
    );
    expect(publicCollaboration).toBeDefined();
    expect(publicCollaboration?.role).toBe('editor');
    expect(publicCollaboration?.deleted_at).toBeNull();
    expect(
      collaborations.find((c) => c.node_id === privateSpaceId)
    ).toBeUndefined();

    // 4. The space node attributes must contain the member so future
    // attribute updates keep the collaboration consistent.
    const spaceNode = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', publicSpaceId)
      .executeTakeFirstOrThrow();
    expect(spaceNode.attributes.type).toBe('space');
    if (spaceNode.attributes.type === 'space') {
      expect(spaceNode.attributes.collaborators[memberId]).toBe('editor');
    }

    // 5. The member sync bootstrap: the collaborations synchronizer must
    // deliver the public space root...
    const connectedMember = {
      userId: memberId,
      workspaceId: workspace.id,
      accountId: generateId(IdType.Account),
      deviceId: generateId(IdType.Device),
    };

    const collaborationSynchronizer = new CollaborationSynchronizer(
      'sync-collaborations',
      connectedMember,
      { type: 'collaborations' },
      '0'
    );
    const collaborationsOutput = await collaborationSynchronizer.fetchData();
    expect(collaborationsOutput).not.toBeNull();
    const collaborationNodeIds = (collaborationsOutput?.items ?? []).map(
      (item) => item.data.nodeId
    );
    expect(collaborationNodeIds).toContain(publicSpaceId);
    expect(collaborationNodeIds).not.toContain(privateSpaceId);

    // 6. ...and the node updates synchronizer for that root must deliver the
    // pre-existing nodes (space + page).
    const nodeUpdatesSynchronizer = new NodeUpdatesSynchronizer(
      'sync-node-updates',
      connectedMember,
      { type: 'node.updates', rootId: publicSpaceId },
      '0'
    );
    const nodeUpdatesOutput = await nodeUpdatesSynchronizer.fetchData();
    expect(nodeUpdatesOutput).not.toBeNull();
    const syncedNodeIds = (nodeUpdatesOutput?.items ?? []).map(
      (item) => item.data.nodeId
    );
    expect(syncedNodeIds).toContain(publicSpaceId);
    expect(syncedNodeIds).toContain(publicPageId);
  });

  it('maps workspace roles to space roles (admin gets admin, guest gets viewer)', async () => {
    const ownerAccount = await createAccount({
      email: `owner-${generateId(IdType.Account)}@example.com`,
      password: 'Password123!',
    });
    const workspace = await createWorkspace({ createdBy: ownerAccount.id });
    const owner = await createUser({
      workspaceId: workspace.id,
      account: ownerAccount,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: ownerAccount.id });

    const publicSpaceId = await createSpace({
      workspaceId: workspace.id,
      userId: owner.id,
      name: 'Wiki',
      visibility: 'public',
    });

    const adminEmail = `admin-${generateId(IdType.Account)}@example.com`;
    const guestEmail = `guest-${generateId(IdType.Account)}@example.com`;
    const response = await app.inject({
      method: 'POST',
      url: `/client/v1/workspaces/${workspace.id}/users`,
      headers: buildAuthHeader(token),
      body: {
        users: [
          { email: adminEmail, role: 'admin' },
          { email: guestEmail, role: 'guest' },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const output = response.json();
    expect(output.errors).toHaveLength(0);

    const adminId = output.users.find(
      (u: { email: string }) => u.email === adminEmail
    )?.id as string;
    const guestId = output.users.find(
      (u: { email: string }) => u.email === guestEmail
    )?.id as string;

    const adminCollaboration = await database
      .selectFrom('collaborations')
      .selectAll()
      .where('collaborator_id', '=', adminId)
      .where('node_id', '=', publicSpaceId)
      .executeTakeFirst();
    expect(adminCollaboration?.role).toBe('admin');

    const guestCollaboration = await database
      .selectFrom('collaborations')
      .selectAll()
      .where('collaborator_id', '=', guestId)
      .where('node_id', '=', publicSpaceId)
      .executeTakeFirst();
    expect(guestCollaboration?.role).toBe('viewer');
  });
});
