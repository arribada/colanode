import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiErrorCode, IdType, generateId } from '@colanode/core';
import { updateDocument } from '@colanode/server/lib/documents';

import { buildTestApp } from '../helpers/app';
import {
  buildAuthHeader,
  createAccount,
  createDevice,
  createFileNode,
  createPageNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const app = buildTestApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const seedPage = async () => {
  const account = await createAccount();
  const workspace = await createWorkspace({ createdBy: account.id });
  const user = await createUser({
    workspaceId: workspace.id,
    account,
    role: 'owner',
  });
  const base = { workspaceId: workspace.id, userId: user.id };
  const spaceId = await createSpaceNode({ ...base, name: 'Space' });
  const pageId = await createPageNode({
    ...base,
    parentId: spaceId,
    rootId: spaceId,
  });

  return { account, workspace, user, base, spaceId, pageId };
};

describe('node sync route', () => {
  it('hands over the page, its ancestors, its children and its document', async () => {
    const { account, workspace, base, spaceId, pageId } = await seedPage();

    const blockId = generateId(IdType.Block);
    await updateDocument({
      documentId: pageId,
      ...base,
      updater: () => ({
        type: 'rich_text',
        blocks: {
          [blockId]: {
            id: blockId,
            type: 'paragraph',
            parentId: pageId,
            index: 'a0',
            content: [{ type: 'text', text: 'measured on the gateway' }],
          },
        },
      }),
    });

    const fileId = await createFileNode({
      ...base,
      parentId: pageId,
      rootId: spaceId,
      size: 1024,
    });

    const { token } = await createDevice({ accountId: account.id });
    const response = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/nodes/${pageId}/sync`,
      headers: buildAuthHeader(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    // The ancestors matter as much as the page: without the space that
    // carries the collaborator grant the client cannot resolve a role.
    const nodeIds = body.nodes.map(
      (update: { nodeId: string }) => update.nodeId
    );
    expect(nodeIds).toContain(spaceId);
    expect(nodeIds).toContain(pageId);
    expect(nodeIds).toContain(fileId);

    // Same shape as the socket stream, and in revision order, since a node is
    // built from the first update a client receives.
    const revisions = body.nodes.map((update: { revision: string }) =>
      BigInt(update.revision)
    );
    expect([...revisions].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))).toEqual(
      revisions
    );
    expect(body.nodes[0]).toMatchObject({
      nodeId: expect.any(String),
      rootId: spaceId,
      workspaceId: workspace.id,
      data: expect.any(String),
    });

    expect(body.documents).toHaveLength(1);
    expect(body.documents[0]).toMatchObject({
      documentId: pageId,
      data: expect.any(String),
    });
  });

  it('refuses a workspace member who has no role on the tree', async () => {
    const { workspace, pageId } = await seedPage();

    const outsiderAccount = await createAccount();
    await createUser({
      workspaceId: workspace.id,
      account: outsiderAccount,
      role: 'collaborator',
    });
    const { token } = await createDevice({ accountId: outsiderAccount.id });

    const response = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/nodes/${pageId}/sync`,
      headers: buildAuthHeader(token),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: ApiErrorCode.NodeNoAccess });
  });

  it('refuses a page that belongs to another workspace', async () => {
    const { pageId } = await seedPage();

    const otherAccount = await createAccount();
    const otherWorkspace = await createWorkspace({
      createdBy: otherAccount.id,
    });
    await createUser({
      workspaceId: otherWorkspace.id,
      account: otherAccount,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: otherAccount.id });

    const response = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${otherWorkspace.id}/nodes/${pageId}/sync`,
      headers: buildAuthHeader(token),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ApiErrorCode.NodeNotFound });
  });

  it('returns 404 for a node that does not exist', async () => {
    const { account, workspace } = await seedPage();
    const { token } = await createDevice({ accountId: account.id });

    const response = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/nodes/${generateId(IdType.Page)}/sync`,
      headers: buildAuthHeader(token),
    });

    expect(response.statusCode).toBe(404);
  });
});
