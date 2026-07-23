import { describe, expect, it } from 'vitest';

import { notificationReadMutationSchema } from '@colanode/core';

describe('notification.read mutation schema', () => {
  it('parses a valid mark-read mutation', () => {
    const parsed = notificationReadMutationSchema.parse({
      id: 'mut1',
      createdAt: new Date().toISOString(),
      type: 'notification.read',
      data: { notificationId: 'notif1', readAt: new Date().toISOString() },
    });
    expect(parsed.data.notificationId).toBe('notif1');
  });
});
