import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@colanode/server/lib/push/web-push-sender', () => ({
  sendWebPush: vi.fn().mockResolvedValue(undefined),
}));

const apnsSendMock = vi.fn().mockResolvedValue({ sent: [], failed: [] });

vi.mock('@parse/node-apn', () => ({
  default: {
    Provider: class {
      send = apnsSendMock;
    },
    Notification: class {},
  },
}));

import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { config } from '@colanode/server/lib/config';
import { eventBus } from '@colanode/server/lib/event-bus';
import { sendWebPush } from '@colanode/server/lib/push/web-push-sender';
import { pushService } from '@colanode/server/services/push-service';

import {
  createAccount,
  createWorkspace,
  createUser,
  createSpaceNode,
  createChannelNode,
  createMessageNode,
} from '../helpers/seed';

const waitFor = async (fn: () => Promise<boolean>, ms = 2000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

beforeAll(async () => {
  // config.push/apns prefault to { enabled: false } in the test env — without
  // this patch pushService.init() no-ops and no push is ever dispatched.
  // sendWebPush and @parse/node-apn are mocked above, so the fake VAPID/APNs
  // credentials are never used.
  config.push = {
    enabled: true,
    subject: 'mailto:test@example.com',
    publicKey: 'pk',
    privateKey: 'sk',
  };
  config.apns = {
    enabled: true,
    key: 'key-contents',
    keyId: 'kid',
    teamId: 'tid',
    bundleId: 'com.example.app',
  };
  await pushService.init();
});

describe('pushService', () => {
  it('sends a push to a channel member (not the author) who has a subscription and is not muted', async () => {
    const authorAccount = await createAccount();
    const memberAccount = await createAccount();
    const workspace = await createWorkspace({ createdBy: authorAccount.id });
    const author = await createUser({
      workspaceId: workspace.id,
      account: authorAccount,
      role: 'collaborator',
    });
    const member = await createUser({
      workspaceId: workspace.id,
      account: memberAccount,
      role: 'collaborator',
    });

    // Collaboration access is materialized on the space (a channel has no
    // collaborators of its own — access is inherited from the owning space,
    // exactly as the socket fanout resolves it).
    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: author.id,
      collaborators: { [member.id]: 'collaborator' },
    });

    const channelId = await createChannelNode({
      workspaceId: workspace.id,
      userId: author.id,
      parentId: spaceId,
      rootId: spaceId,
    });

    await database
      .insertInto('push_subscriptions')
      .values({
        id: generateId(IdType.Device),
        account_id: memberAccount.id,
        device_id: generateId(IdType.Device),
        endpoint: 'https://push.example/ok',
        p256dh: 'k',
        auth: 'a',
        created_at: new Date(),
      })
      .execute();

    const messageId = await createMessageNode({
      workspaceId: workspace.id,
      userId: author.id,
      rootId: spaceId,
      parentId: channelId,
    });

    eventBus.publish({
      type: 'node.created',
      nodeId: messageId,
      rootId: spaceId,
      workspaceId: workspace.id,
    });

    const sendWebPushMock = sendWebPush as unknown as ReturnType<typeof vi.fn>;
    const ok = await waitFor(async () => sendWebPushMock.mock.calls.length > 0);
    expect(ok).toBe(true);

    const [subscription, payload] = sendWebPushMock.mock.calls[0]!;
    expect(subscription.account_id).toBe(memberAccount.id);
    expect(payload.rootId).toBe(channelId);
    expect(payload.nodeId).toBe(messageId);
    expect(payload.url).toBe(`/workspace/${member.id}/${channelId}`);
  });

  it('sends an apns push to a channel member (not the author) who has an apns subscription and is not muted', async () => {
    const authorAccount = await createAccount();
    const memberAccount = await createAccount();
    const workspace = await createWorkspace({ createdBy: authorAccount.id });
    const author = await createUser({
      workspaceId: workspace.id,
      account: authorAccount,
      role: 'collaborator',
    });
    const member = await createUser({
      workspaceId: workspace.id,
      account: memberAccount,
      role: 'collaborator',
    });

    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: author.id,
      collaborators: { [member.id]: 'collaborator' },
    });

    const channelId = await createChannelNode({
      workspaceId: workspace.id,
      userId: author.id,
      parentId: spaceId,
      rootId: spaceId,
    });

    const deviceToken = `apns-token-${generateId(IdType.Device)}`;
    await database
      .insertInto('apns_subscriptions')
      .values({
        id: generateId(IdType.Device),
        account_id: memberAccount.id,
        device_id: generateId(IdType.Device),
        device_token: deviceToken,
        created_at: new Date(),
      })
      .execute();

    const messageId = await createMessageNode({
      workspaceId: workspace.id,
      userId: author.id,
      rootId: spaceId,
      parentId: channelId,
    });

    apnsSendMock.mockClear();
    eventBus.publish({
      type: 'node.created',
      nodeId: messageId,
      rootId: spaceId,
      workspaceId: workspace.id,
    });

    const ok = await waitFor(async () => apnsSendMock.mock.calls.length > 0);
    expect(ok).toBe(true);

    const [notification, sentDeviceToken] = apnsSendMock.mock.calls[0]!;
    expect(sentDeviceToken).toBe(deviceToken);
    expect(notification.topic).toBe('com.example.app');
    expect(notification.payload.rootId).toBe(channelId);
    expect(notification.payload.nodeId).toBe(messageId);
    expect(notification.payload.url).toBe(
      `/workspace/${member.id}/${channelId}`
    );
  });
});
