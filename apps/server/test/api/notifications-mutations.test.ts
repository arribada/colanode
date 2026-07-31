import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { IdType, MutationStatus, generateId } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { createNotification } from '@colanode/server/lib/notifications';

import { buildTestApp } from '../helpers/app';
import {
  buildAuthHeader,
  createAccount,
  createDevice,
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

describe('notification.read mutation route', () => {
  it('marks a notification read', async () => {
    const account = await createAccount({
      email: `notif-read-${generateId(IdType.Account)}@example.com`,
    });

    const workspace = await createWorkspace({
      createdBy: account.id,
    });

    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'collaborator',
    });

    const { token } = await createDevice({ accountId: account.id });

    const notif = await createNotification({
      userId: user.id,
      workspaceId: workspace.id,
      rootId: generateId(IdType.Space),
      type: 'mention',
      sourceNodeId: generateId(IdType.Message),
      actorId: null,
      preview: {},
    });

    expect(notif).not.toBeNull();

    const res = await app.inject({
      method: 'POST',
      url: `/client/v1/workspaces/${workspace.id}/mutations`,
      headers: buildAuthHeader(token),
      payload: {
        mutations: [
          {
            id: generateId(IdType.Mutation),
            createdAt: new Date().toISOString(),
            type: 'notification.read',
            data: {
              notificationId: notif!.id,
              readAt: new Date().toISOString(),
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { results: { id: string; status: number }[] };
    expect(body.results[0]?.status).toBe(MutationStatus.OK);

    const row = await database
      .selectFrom('notifications')
      .selectAll()
      .where('id', '=', notif!.id)
      .executeTakeFirstOrThrow();

    expect(row.read_at).not.toBeNull();
  });
});
