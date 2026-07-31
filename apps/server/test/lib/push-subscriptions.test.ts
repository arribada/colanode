import { describe, expect, it } from 'vitest';

import { MutationStatus, generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { createPushSubscription } from '@colanode/server/lib/push-subscriptions';

import { createAccount, createWorkspace, createUser } from '../helpers/seed';

const buildContext = async () => {
  const account = await createAccount();
  const workspace = await createWorkspace({ createdBy: account.id });
  const user = await createUser({
    workspaceId: workspace.id,
    account,
    role: 'collaborator',
  });
  return {
    id: workspace.id,
    status: workspace.status,
    user: { id: user.id, accountId: account.id, role: user.role as never },
  };
};

const buildMutation = (endpoint: string) => ({
  id: generateId(IdType.Mutation),
  createdAt: new Date().toISOString(),
  type: 'pushSubscription.create' as const,
  data: {
    endpoint,
    p256dh: 'k',
    auth: 'a',
    deviceId: generateId(IdType.Device),
    createdAt: new Date().toISOString(),
  },
});

describe('createPushSubscription', () => {
  it('stores a subscription for a public https endpoint', async () => {
    const ctx = await buildContext();
    const endpoint = `https://push.example.com/reg/${generateId(IdType.Device)}`;

    const status = await createPushSubscription(
      ctx as never,
      buildMutation(endpoint)
    );

    expect(status).toBe(MutationStatus.OK);
    const row = await database
      .selectFrom('push_subscriptions')
      .select(['id'])
      .where('endpoint', '=', endpoint)
      .executeTakeFirst();
    expect(row).toBeDefined();
  });

  it.each([
    ['plain http', 'http://push.example.com/reg/1'],
    ['localhost', 'https://localhost/reg/1'],
    ['localhost subdomain', 'https://evil.localhost/reg/1'],
    ['loopback ip', 'https://127.0.0.1/reg/1'],
    ['rfc1918 10/8', 'https://10.0.0.5/reg/1'],
    ['rfc1918 172.16/12', 'https://172.16.0.1/reg/1'],
    ['rfc1918 192.168/16', 'https://192.168.1.1/reg/1'],
    ['link-local metadata', 'https://169.254.169.254/latest/meta-data'],
    ['ipv6 loopback', 'https://[::1]/reg/1'],
    ['not a url', 'not-a-url'],
  ])(
    'rejects %s endpoint without storing it (SSRF guard)',
    async (_label, endpoint) => {
      const ctx = await buildContext();

      const status = await createPushSubscription(
        ctx as never,
        buildMutation(endpoint)
      );

      expect(status).toBe(MutationStatus.BAD_REQUEST);
      const row = await database
        .selectFrom('push_subscriptions')
        .select(['id'])
        .where('endpoint', '=', endpoint)
        .executeTakeFirst();
      expect(row).toBeUndefined();
    }
  );
});
