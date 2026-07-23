import { describe, expect, it } from 'vitest';

import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';

describe('notifications table', () => {
  it('inserts a row and auto-assigns a revision; UPDATE bumps it', async () => {
    const id = generateId(IdType.Notification);
    const userId = generateId(IdType.User);
    const inserted = await database
      .insertInto('notifications')
      .returningAll()
      .values({
        id,
        user_id: userId,
        workspace_id: generateId(IdType.Workspace),
        root_id: generateId(IdType.Space),
        type: 'mention',
        source_node_id: generateId(IdType.Message),
        actor_id: generateId(IdType.User),
        preview: {},
        created_at: new Date(),
        read_at: null,
      })
      .executeTakeFirstOrThrow();
    expect(BigInt(inserted.revision)).toBeGreaterThan(0n);

    const updated = await database
      .updateTable('notifications')
      .returningAll()
      .set({ read_at: new Date() })
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(BigInt(updated.revision)).toBeGreaterThan(BigInt(inserted.revision));
  });
});
