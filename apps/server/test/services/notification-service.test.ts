import { beforeAll, describe, expect, it } from 'vitest';

import { database } from '@colanode/server/data/database';
import { eventBus } from '@colanode/server/lib/event-bus';
import { notificationService } from '@colanode/server/services/notification-service';

import {
  createAccount,
  createWorkspace,
  createUser,
  createSpaceNode,
  createMessageNode,
} from '../helpers/seed';

beforeAll(async () => {
  await notificationService.init();
});

const waitFor = async (fn: () => Promise<boolean>, ms = 2000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

describe('NotificationService', () => {
  it('creates a mention notification when a message node mentioning a user is created', async () => {
    const authorAccount = await createAccount();
    const mentionedAccount = await createAccount();

    const workspace = await createWorkspace({ createdBy: authorAccount.id });

    const author = await createUser({
      workspaceId: workspace.id,
      account: authorAccount,
      role: 'collaborator',
    });
    const mentioned = await createUser({
      workspaceId: workspace.id,
      account: mentionedAccount,
      role: 'collaborator',
    });

    // Create space with both users as collaborators
    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: author.id,
      collaborators: { [mentioned.id]: 'collaborator' },
    });

    // Create message node with a mention block targeting the mentioned user
    const messageId = await createMessageNode({
      workspaceId: workspace.id,
      userId: author.id,
      rootId: spaceId,
      parentId: spaceId,
      mentionUserId: mentioned.id,
    });

    // Publish node.created event (service subscribes to this)
    eventBus.publish({
      type: 'node.created',
      nodeId: messageId,
      rootId: spaceId,
      workspaceId: workspace.id,
    });

    // Wait for the notification to appear (service is async)
    const ok = await waitFor(async () => {
      const row = await database
        .selectFrom('notifications')
        .select(['id'])
        .where('user_id', '=', mentioned.id)
        .where('source_node_id', '=', messageId)
        .executeTakeFirst();
      return !!row;
    });

    expect(ok).toBe(true);
  });

  it('does not notify the actor of their own mention', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const author = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'collaborator',
    });

    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: author.id,
    });

    // Author mentions themselves
    const messageId = await createMessageNode({
      workspaceId: workspace.id,
      userId: author.id,
      rootId: spaceId,
      parentId: spaceId,
      mentionUserId: author.id,
    });

    eventBus.publish({
      type: 'node.created',
      nodeId: messageId,
      rootId: spaceId,
      workspaceId: workspace.id,
    });

    // Wait a bit and assert no notification was created
    await new Promise((r) => setTimeout(r, 200));

    const rows = await database
      .selectFrom('notifications')
      .select(['id'])
      .where('user_id', '=', author.id)
      .where('source_node_id', '=', messageId)
      .execute();

    expect(rows).toHaveLength(0);
  });
});
