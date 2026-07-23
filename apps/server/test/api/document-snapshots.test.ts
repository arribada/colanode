import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ApiErrorCode,
  DocumentContent,
  IdType,
  generateId,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';

import { buildTestApp } from '../helpers/app';
import {
  buildAuthHeader,
  createAccount,
  createDevice,
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

const buildContent = (pageId: string, text: string): DocumentContent => {
  const blockId = generateId(IdType.Block);
  return {
    type: 'rich_text',
    blocks: {
      [blockId]: {
        id: blockId,
        type: 'paragraph',
        parentId: pageId,
        index: 'a0',
        content: [{ type: 'text', text }],
      },
    },
  };
};

const seedSnapshot = async (input: {
  documentId: string;
  workspaceId: string;
  createdBy: string;
  content: DocumentContent;
}) => {
  const id = generateId(IdType.Version);
  await database
    .insertInto('document_snapshots')
    .values({
      id,
      document_id: input.documentId,
      workspace_id: input.workspaceId,
      revision: '1',
      content: JSON.stringify(input.content),
      created_at: new Date(),
      created_by: input.createdBy,
    })
    .execute();

  return id;
};

describe('document snapshots routes', () => {
  it('lists and fetches snapshots for a collaborator of the node tree', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: user.id,
    });
    const pageId = await createPageNode({
      workspaceId: workspace.id,
      userId: user.id,
      parentId: spaceId,
      rootId: spaceId,
    });

    const content = buildContent(pageId, 'hello history');
    const snapshotId = await seedSnapshot({
      documentId: pageId,
      workspaceId: workspace.id,
      createdBy: user.id,
      content,
    });

    const { token } = await createDevice({ accountId: account.id });

    const listResponse = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/documents/${pageId}/snapshots`,
      headers: buildAuthHeader(token),
    });

    expect(listResponse.statusCode).toBe(200);
    const list = listResponse.json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: snapshotId,
      documentId: pageId,
      createdBy: user.id,
    });
    // list items are summaries only — content stays behind the get route
    expect(list[0].content).toBeUndefined();

    const getResponse = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/documents/${pageId}/snapshots/${snapshotId}`,
      headers: buildAuthHeader(token),
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({
      id: snapshotId,
      documentId: pageId,
      content,
    });
  });

  it('rejects a workspace member without access to the node tree', async () => {
    const ownerAccount = await createAccount();
    const workspace = await createWorkspace({ createdBy: ownerAccount.id });
    const ownerUser = await createUser({
      workspaceId: workspace.id,
      account: ownerAccount,
      role: 'owner',
    });
    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: ownerUser.id,
    });
    const pageId = await createPageNode({
      workspaceId: workspace.id,
      userId: ownerUser.id,
      parentId: spaceId,
      rootId: spaceId,
    });

    await seedSnapshot({
      documentId: pageId,
      workspaceId: workspace.id,
      createdBy: ownerUser.id,
      content: buildContent(pageId, 'secret'),
    });

    const outsiderAccount = await createAccount();
    await createUser({
      workspaceId: workspace.id,
      account: outsiderAccount,
      role: 'collaborator',
    });
    const { token } = await createDevice({ accountId: outsiderAccount.id });

    const response = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/documents/${pageId}/snapshots`,
      headers: buildAuthHeader(token),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.DocumentNoAccess,
    });
  });

  it('returns 404 for an unknown document or snapshot', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: user.id,
    });
    const pageId = await createPageNode({
      workspaceId: workspace.id,
      userId: user.id,
      parentId: spaceId,
      rootId: spaceId,
    });
    const { token } = await createDevice({ accountId: account.id });

    const unknownDocumentResponse = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/documents/${generateId(IdType.Page)}/snapshots`,
      headers: buildAuthHeader(token),
    });

    expect(unknownDocumentResponse.statusCode).toBe(404);
    expect(unknownDocumentResponse.json()).toMatchObject({
      code: ApiErrorCode.DocumentNotFound,
    });

    const unknownSnapshotResponse = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/documents/${pageId}/snapshots/${generateId(IdType.Version)}`,
      headers: buildAuthHeader(token),
    });

    expect(unknownSnapshotResponse.statusCode).toBe(404);
    expect(unknownSnapshotResponse.json()).toMatchObject({
      code: ApiErrorCode.DocumentSnapshotNotFound,
    });
  });
});
