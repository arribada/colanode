import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { IdType, MutationStatus, generateId } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { nodeCleanHandler } from '@colanode/server/jobs/node-clean';
import { createNode } from '@colanode/server/lib/nodes';
import { jobService } from '@colanode/server/services/job-service';

import { buildTestApp } from '../helpers/app';
import {
  buildAuthHeader,
  buildCreateNodeMutation,
  createAccount,
  createDevice,
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

describe('thread depth-1 reply', () => {
  it('accepts a reply whose parentId is a message (1-level thread)', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: account.id });

    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: user.id,
    });

    // Create channel via direct helper (bypasses API for speed, trigger still fires)
    const channelId = generateId(IdType.Channel);
    await createNode({
      nodeId: channelId,
      rootId: spaceId,
      attributes: {
        type: 'channel',
        name: 'general',
        parentId: spaceId,
      },
      userId: user.id,
      workspaceId: workspace.id,
    });

    // Create root message via direct helper
    const rootMessageId = generateId(IdType.Message);
    await createNode({
      nodeId: rootMessageId,
      rootId: spaceId,
      attributes: {
        type: 'message',
        subtype: 'standard',
        parentId: channelId,
        content: null,
        taskId: null,
      },
      userId: user.id,
      workspaceId: workspace.id,
    });

    // Post a depth-1 reply via the API (exercises canCreate guard)
    const replyId = generateId(IdType.Message);
    const replyMutation = buildCreateNodeMutation({
      nodeId: replyId,
      attributes: {
        type: 'message',
        subtype: 'standard',
        parentId: rootMessageId,
        content: null,
        taskId: null,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/client/v1/workspaces/${workspace.id}/mutations`,
      headers: buildAuthHeader(token),
      payload: { mutations: [replyMutation] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { results: { status: number }[] };
    expect(body.results[0]?.status).toBe(MutationStatus.CREATED);

    // Verify it landed in the DB
    const savedReply = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', replyId)
      .executeTakeFirst();

    expect(savedReply).not.toBeUndefined();
    const replyAttrs = savedReply!.attributes as Record<string, unknown>;
    expect(replyAttrs['parentId']).toBe(rootMessageId);
  });
});

describe('thread depth-2 reply rejected', () => {
  it('rejects a reply whose parentId is itself a thread reply (depth-2)', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: account.id });

    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: user.id,
    });

    const channelId = generateId(IdType.Channel);
    await createNode({
      nodeId: channelId,
      rootId: spaceId,
      attributes: {
        type: 'channel',
        name: 'general',
        parentId: spaceId,
      },
      userId: user.id,
      workspaceId: workspace.id,
    });

    const rootMessageId = generateId(IdType.Message);
    await createNode({
      nodeId: rootMessageId,
      rootId: spaceId,
      attributes: {
        type: 'message',
        subtype: 'standard',
        parentId: channelId,
        content: null,
        taskId: null,
      },
      userId: user.id,
      workspaceId: workspace.id,
    });

    const depth1ReplyId = generateId(IdType.Message);
    await createNode({
      nodeId: depth1ReplyId,
      rootId: spaceId,
      attributes: {
        type: 'message',
        subtype: 'standard',
        parentId: rootMessageId,
        content: null,
        taskId: null,
      },
      userId: user.id,
      workspaceId: workspace.id,
    });

    // Attempt depth-2 reply (parentId = a reply) — must be rejected
    const depth2ReplyId = generateId(IdType.Message);
    const depth2Mutation = buildCreateNodeMutation({
      nodeId: depth2ReplyId,
      attributes: {
        type: 'message',
        subtype: 'standard',
        parentId: depth1ReplyId,
        content: null,
        taskId: null,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/client/v1/workspaces/${workspace.id}/mutations`,
      headers: buildAuthHeader(token),
      payload: { mutations: [depth2Mutation] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { results: { status: number }[] };
    expect(body.results[0]?.status).toBe(MutationStatus.FORBIDDEN);

    // Confirm the depth-2 node was NOT persisted
    const notSaved = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', depth2ReplyId)
      .executeTakeFirst();

    expect(notSaved).toBeUndefined();
  });
});

describe('taskId on message and sourceMessageId on record', () => {
  it('creates a message with taskId and a record with sourceMessageId — both accepted and round-trip', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: account.id });

    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: user.id,
    });

    // Channel for the message
    const channelId = generateId(IdType.Channel);
    await createNode({
      nodeId: channelId,
      rootId: spaceId,
      attributes: {
        type: 'channel',
        name: 'tasks-channel',
        parentId: spaceId,
      },
      userId: user.id,
      workspaceId: workspace.id,
    });

    // Database node for the record
    const dbId = generateId(IdType.Database);
    const fieldId = generateId(IdType.Field);
    await createNode({
      nodeId: dbId,
      rootId: spaceId,
      attributes: {
        type: 'database',
        name: 'Tasks DB',
        parentId: spaceId,
        fields: {
          [fieldId]: {
            id: fieldId,
            type: 'select',
            name: 'Status',
            index: 'a0',
            options: {
              opt1so: { id: 'opt1so', name: 'Open', color: '#3b82f6', index: 'a0' },
            },
          },
        },
      },
      userId: user.id,
      workspaceId: workspace.id,
    });

    // Build a fake taskId (any string is fine — the schema accepts nullable string)
    const fakeTaskId = generateId(IdType.Record);

    // Message with taskId
    const messageId = generateId(IdType.Message);
    const messageMutation = buildCreateNodeMutation({
      nodeId: messageId,
      attributes: {
        type: 'message',
        subtype: 'standard',
        parentId: channelId,
        content: null,
        taskId: fakeTaskId,
      },
    });

    // Record with sourceMessageId = messageId
    const recordId = generateId(IdType.Record);
    const recordMutation = buildCreateNodeMutation({
      nodeId: recordId,
      attributes: {
        type: 'record',
        parentId: dbId,
        databaseId: dbId,
        name: 'Record 1',
        fields: {},
        sourceMessageId: messageId,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/client/v1/workspaces/${workspace.id}/mutations`,
      headers: buildAuthHeader(token),
      payload: { mutations: [messageMutation, recordMutation] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { results: { status: number }[] };
    expect(body.results[0]?.status).toBe(MutationStatus.CREATED);
    expect(body.results[1]?.status).toBe(MutationStatus.CREATED);

    // Round-trip: verify attributes are stored correctly
    const savedMessage = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', messageId)
      .executeTakeFirst();

    expect(savedMessage).not.toBeUndefined();
    const msgAttrs = savedMessage!.attributes as Record<string, unknown>;
    expect(msgAttrs['taskId']).toBe(fakeTaskId);

    const savedRecord = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', recordId)
      .executeTakeFirst();

    expect(savedRecord).not.toBeUndefined();
    const recAttrs = savedRecord!.attributes as Record<string, unknown>;
    expect(recAttrs['sourceMessageId']).toBe(messageId);
  });
});

describe('thread root deletion cascade', () => {
  it('tombstones the root message and cleans up replies when nodeCleanHandler is invoked', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: account.id });

    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: user.id,
    });

    const channelId = generateId(IdType.Channel);
    await createNode({
      nodeId: channelId,
      rootId: spaceId,
      attributes: {
        type: 'channel',
        name: 'cascade-channel',
        parentId: spaceId,
      },
      userId: user.id,
      workspaceId: workspace.id,
    });

    // Root message
    const rootMessageId = generateId(IdType.Message);
    await createNode({
      nodeId: rootMessageId,
      rootId: spaceId,
      attributes: {
        type: 'message',
        subtype: 'standard',
        parentId: channelId,
        content: null,
        taskId: null,
      },
      userId: user.id,
      workspaceId: workspace.id,
    });

    // Two depth-1 replies
    const reply1Id = generateId(IdType.Message);
    await createNode({
      nodeId: reply1Id,
      rootId: spaceId,
      attributes: {
        type: 'message',
        subtype: 'standard',
        parentId: rootMessageId,
        content: null,
        taskId: null,
      },
      userId: user.id,
      workspaceId: workspace.id,
    });

    const reply2Id = generateId(IdType.Message);
    await createNode({
      nodeId: reply2Id,
      rootId: spaceId,
      attributes: {
        type: 'message',
        subtype: 'standard',
        parentId: rootMessageId,
        content: null,
        taskId: null,
      },
      userId: user.id,
      workspaceId: workspace.id,
    });

    // Spy on addJob so the BullMQ worker isn't invoked asynchronously
    const addJobSpy = vi
      .spyOn(jobService, 'addJob')
      .mockResolvedValue(undefined);

    // Delete the root message via the API
    const deletedAt = new Date().toISOString();
    const deleteResponse = await app.inject({
      method: 'POST',
      url: `/client/v1/workspaces/${workspace.id}/mutations`,
      headers: buildAuthHeader(token),
      payload: {
        mutations: [
          {
            id: generateId(IdType.Mutation),
            createdAt: deletedAt,
            type: 'node.delete',
            data: {
              nodeId: rootMessageId,
              rootId: spaceId,
              deletedAt,
            },
          },
        ],
      },
    });

    expect(deleteResponse.statusCode).toBe(200);
    const deleteBody = deleteResponse.json() as { results: { status: number }[] };
    expect(deleteBody.results[0]?.status).toBe(MutationStatus.OK);

    // The job spy must have been called with the node.clean job
    expect(addJobSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'node.clean',
        nodeId: rootMessageId,
        workspaceId: workspace.id,
        userId: user.id,
      })
    );

    // Phase 1: root message is already gone from nodes, tombstone exists
    const rootAfterDelete = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', rootMessageId)
      .executeTakeFirst();
    expect(rootAfterDelete).toBeUndefined();

    const rootTombstone = await database
      .selectFrom('node_tombstones')
      .selectAll()
      .where('id', '=', rootMessageId)
      .executeTakeFirst();
    expect(rootTombstone).not.toBeUndefined();
    expect(rootTombstone?.root_id).toBe(spaceId);

    // Phase 1 only: replies are still in nodes (job not yet run)
    const reply1Before = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', reply1Id)
      .executeTakeFirst();
    expect(reply1Before).not.toBeUndefined();

    const reply2Before = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', reply2Id)
      .executeTakeFirst();
    expect(reply2Before).not.toBeUndefined();

    // Restore spy before running the job handler directly
    addJobSpy.mockRestore();

    // Phase 2: run the node.clean job handler directly to exercise cascade
    await nodeCleanHandler({
      type: 'node.clean',
      nodeId: rootMessageId,
      parentId: channelId,
      workspaceId: workspace.id,
      userId: user.id,
    });

    // After clean: replies must be gone from nodes
    const reply1After = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', reply1Id)
      .executeTakeFirst();
    expect(reply1After).toBeUndefined();

    const reply2After = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', reply2Id)
      .executeTakeFirst();
    expect(reply2After).toBeUndefined();

    // After clean: replies are tombstoned
    const reply1Tombstone = await database
      .selectFrom('node_tombstones')
      .selectAll()
      .where('id', '=', reply1Id)
      .executeTakeFirst();
    expect(reply1Tombstone).not.toBeUndefined();

    const reply2Tombstone = await database
      .selectFrom('node_tombstones')
      .selectAll()
      .where('id', '=', reply2Id)
      .executeTakeFirst();
    expect(reply2Tombstone).not.toBeUndefined();
  });
});
