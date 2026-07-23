import { describe, expect, it } from 'vitest';

import { generateId, IdType, MutationStatus } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import {
  createNotification,
  markNotificationRead,
} from '@colanode/server/lib/notifications';

import {
  createAccount,
  createWorkspace,
  createUser,
} from '../helpers/seed';

describe('notifications lib', () => {
  it('creates one notification and dedups a second unread for the same source', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'collaborator',
    });
    const rootId = generateId(IdType.Space);
    const sourceNodeId = generateId(IdType.Message);

    const first = await createNotification({
      userId: user.id,
      workspaceId: workspace.id,
      rootId,
      type: 'mention',
      sourceNodeId,
      actorId: generateId(IdType.User),
      preview: {},
    });
    const second = await createNotification({
      userId: user.id,
      workspaceId: workspace.id,
      rootId,
      type: 'mention',
      sourceNodeId,
      actorId: generateId(IdType.User),
      preview: {},
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();

    const rows = await database
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', user.id)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('marks a notification read', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'collaborator',
    });
    const created = await createNotification({
      userId: user.id,
      workspaceId: workspace.id,
      rootId: generateId(IdType.Space),
      type: 'direct_message',
      sourceNodeId: generateId(IdType.Message),
      actorId: null,
      preview: {},
    });

    const readAt = new Date().toISOString();
    const status = await markNotificationRead(
      {
        id: workspace.id,
        status: workspace.status,
        user: { id: user.id, accountId: account.id, role: user.role as never },
      },
      {
        id: 'm1',
        createdAt: new Date().toISOString(),
        type: 'notification.read',
        data: { notificationId: created!.id, readAt },
      }
    );
    expect(status).toBe(MutationStatus.OK);
    const row = await database
      .selectFrom('notifications')
      .selectAll()
      .where('id', '=', created!.id)
      .executeTakeFirstOrThrow();
    expect(row.read_at).not.toBeNull();
  });
});
