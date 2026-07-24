import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@colanode/server/lib/zulip/zulip-client', () => ({
  sendZulipMessage: vi.fn().mockResolvedValue(undefined),
}));

import { generateId, IdType } from '@colanode/core';
import { config } from '@colanode/server/lib/config';
import { createNotification } from '@colanode/server/lib/notifications';
import { sendZulipMessage } from '@colanode/server/lib/zulip/zulip-client';

import { createAccount, createWorkspace, createUser } from '../helpers/seed';

const sendZulipMessageMock = sendZulipMessage as unknown as ReturnType<
  typeof vi.fn
>;

const waitFor = async (fn: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
};

// Exercises the createNotification -> notifyZulip -> sendZulipMessage hook
// end to end (real DB, mocked network client) for both the enabled-flag
// gating and the happy path.
describe('createNotification Zulip hook', () => {
  beforeEach(() => {
    sendZulipMessageMock.mockClear();
  });

  it('never calls the Zulip client while the integration is disabled', async () => {
    config.zulip = { enabled: false };

    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'collaborator',
    });

    await createNotification({
      userId: user.id,
      workspaceId: workspace.id,
      rootId: generateId(IdType.Space),
      type: 'mention',
      sourceNodeId: generateId(IdType.Message),
      actorId: generateId(IdType.User),
      preview: {},
    });

    // notifyZulip's disabled check is synchronous, so nothing is scheduled —
    // this pause just guards against a regression that would schedule work.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendZulipMessageMock).not.toHaveBeenCalled();
  });

  it('posts a Zulip message once a notification is created while enabled', async () => {
    config.zulip = {
      enabled: true,
      site: 'https://zulip.example.com',
      botEmail: 'bot@example.com',
      apiKey: 'test-key',
      stream: 'colanode',
    };

    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'collaborator',
    });

    await createNotification({
      userId: user.id,
      workspaceId: workspace.id,
      rootId: generateId(IdType.Space),
      type: 'direct_message',
      sourceNodeId: generateId(IdType.Message),
      actorId: null,
      preview: {},
    });

    const ok = await waitFor(() => sendZulipMessageMock.mock.calls.length > 0);
    expect(ok).toBe(true);

    const [message] = sendZulipMessageMock.mock.calls[0]!;
    expect(message.content).toContain('sent you a message');
    expect(typeof message.topic).toBe('string');
  });

  it('does not call the Zulip client twice for a deduped repeat notification', async () => {
    config.zulip = {
      enabled: true,
      site: 'https://zulip.example.com',
      botEmail: 'bot@example.com',
      apiKey: 'test-key',
      stream: 'colanode',
    };

    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'collaborator',
    });
    const rootId = generateId(IdType.Space);
    const sourceNodeId = generateId(IdType.Message);

    await createNotification({
      userId: user.id,
      workspaceId: workspace.id,
      rootId,
      type: 'mention',
      sourceNodeId,
      actorId: generateId(IdType.User),
      preview: {},
    });
    await waitFor(() => sendZulipMessageMock.mock.calls.length > 0);
    sendZulipMessageMock.mockClear();

    const second = await createNotification({
      userId: user.id,
      workspaceId: workspace.id,
      rootId,
      type: 'mention',
      sourceNodeId,
      actorId: generateId(IdType.User),
      preview: {},
    });

    expect(second).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendZulipMessageMock).not.toHaveBeenCalled();
  });
});
