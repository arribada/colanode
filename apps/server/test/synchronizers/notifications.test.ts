import { describe, expect, it } from 'vitest';

import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { NotificationSynchronizer } from '@colanode/server/synchronizers/notifications';

const insertNotif = (userId: string) =>
  database
    .insertInto('notifications')
    .returningAll()
    .values({
      id: generateId(IdType.Notification),
      user_id: userId,
      workspace_id: generateId(IdType.Workspace),
      root_id: generateId(IdType.Space),
      type: 'mention',
      source_node_id: generateId(IdType.Message),
      actor_id: null,
      preview: {},
      created_at: new Date(),
      read_at: null,
    })
    .executeTakeFirstOrThrow();

describe('NotificationSynchronizer', () => {
  it('streams notifications in revision order after the cursor', async () => {
    const userId = generateId(IdType.User);
    const first = await insertNotif(userId);
    const second = await insertNotif(userId);

    const user = {
      userId,
      workspaceId: first.workspace_id,
      accountId: generateId(IdType.Account),
      deviceId: generateId(IdType.Device),
    };

    const all = await new NotificationSynchronizer(
      's1',
      user,
      { type: 'notifications' },
      '0'
    ).fetchData();

    expect(all).not.toBeNull();
    expect(all?.items).toHaveLength(2);

    const firstCursor = BigInt(all!.items[0]!.cursor);
    const secondCursor = BigInt(all!.items[1]!.cursor);
    expect(firstCursor).toBe(BigInt(first.revision));
    expect(secondCursor).toBe(BigInt(second.revision));
    expect(firstCursor < secondCursor).toBe(true);

    const rest = await new NotificationSynchronizer(
      's2',
      user,
      { type: 'notifications' },
      first.revision.toString()
    ).fetchData();

    expect(rest?.items).toHaveLength(1);
    expect(rest?.items[0]?.data.id).toBe(second.id);
  });
});
