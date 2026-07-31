import { describe, expect, it } from 'vitest';

import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { setNotificationMute } from '@colanode/server/lib/notification-mutes';

import { createAccount, createWorkspace, createUser } from '../helpers/seed';

describe('notification mutes', () => {
  it('upserts a mute row and toggles muted', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'collaborator',
    });
    const nodeId = generateId(IdType.Channel);
    const ctx = {
      id: workspace.id,
      status: workspace.status,
      user: { id: user.id, accountId: account.id, role: user.role as never },
    };

    await setNotificationMute(ctx as never, {
      id: 'm1',
      createdAt: new Date().toISOString(),
      type: 'mute.set',
      data: { nodeId, muted: true, updatedAt: new Date().toISOString() },
    });
    let row = await database
      .selectFrom('notification_mutes')
      .selectAll()
      .where('user_id', '=', user.id)
      .where('node_id', '=', nodeId)
      .executeTakeFirstOrThrow();
    expect(row.muted).toBe(true);

    await setNotificationMute(ctx as never, {
      id: 'm2',
      createdAt: new Date().toISOString(),
      type: 'mute.set',
      data: { nodeId, muted: false, updatedAt: new Date().toISOString() },
    });
    row = await database
      .selectFrom('notification_mutes')
      .selectAll()
      .where('user_id', '=', user.id)
      .where('node_id', '=', nodeId)
      .executeTakeFirstOrThrow();
    expect(row.muted).toBe(false);
  });
});
