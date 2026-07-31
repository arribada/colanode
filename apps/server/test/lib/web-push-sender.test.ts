import { beforeAll, describe, expect, it, vi } from 'vitest';

import { database } from '@colanode/server/data/database';
import { config } from '@colanode/server/lib/config';
import { sendWebPush } from '@colanode/server/lib/push/web-push-sender';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

// eslint-disable-next-line import/order -- must stay below the vi.mock call
import webpush from 'web-push';

beforeAll(() => {
  // config.push prefaults to { enabled: false } in the test env — without this
  // patch sendWebPush returns before reaching the pruning logic under test.
  // web-push itself is mocked above, so the fake VAPID keys are never used.
  config.push = {
    enabled: true,
    subject: 'mailto:test@example.com',
    publicKey: 'pk',
    privateKey: 'sk',
  };
});

describe('sendWebPush', () => {
  it('deletes the subscription row on a 410 Gone', async () => {
    // seed a subscription row
    await database
      .insertInto('push_subscriptions')
      .values({
        id: 'sub_test_410',
        account_id: 'acc_1',
        device_id: 'dev_1',
        endpoint: 'https://push.example/410',
        p256dh: 'k',
        auth: 'a',
        created_at: new Date(),
      })
      .execute();

    (
      webpush.sendNotification as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));

    await sendWebPush(
      {
        id: 'sub_test_410',
        endpoint: 'https://push.example/410',
        p256dh: 'k',
        auth: 'a',
      } as never,
      { title: 't', body: 'b', rootId: 'r', nodeId: 'n', workspaceId: 'w', url: '/' }
    );

    const row = await database
      .selectFrom('push_subscriptions')
      .select(['id'])
      .where('id', '=', 'sub_test_410')
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });
});
