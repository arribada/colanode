import { describe, expect, it } from 'vitest';

import { buildDialog } from '@colanode/bot/dialog';

describe('buildDialog', () => {
  const entries = [
    { createdBy: 'us-a', createdAt: '2026-01-01T00:00:02Z', text: 'second' },
    { createdBy: 'us-bot', createdAt: '2026-01-01T00:00:01Z', text: 'first' },
    { createdBy: 'us-a', createdAt: '2026-01-01T00:00:03Z', text: '' },
  ];

  it('orders by createdAt, maps roles, drops empty text', () => {
    expect(buildDialog(entries, 'us-bot')).toEqual([
      { role: 'assistant', content: 'first' },
      { role: 'user', content: 'second' },
    ]);
  });
});
