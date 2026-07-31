import { describe, expect, it } from 'vitest';

import { resolveUserId } from '@colanode/mcp/bootstrap';

const ws = (workspaceId: string, userId: string) =>
  ({ workspaceId, userId, name: workspaceId }) as never;

describe('resolveUserId', () => {
  it('returns the userId for the requested workspaceId', () => {
    const list = [ws('wc-a', 'us-a'), ws('wc-b', 'us-b')];
    expect(resolveUserId(list, 'wc-b')).toBe('us-b');
  });

  it('returns the only workspace when none requested', () => {
    expect(resolveUserId([ws('wc-a', 'us-a')], undefined)).toBe('us-a');
  });

  it('throws when the requested workspace is not found', () => {
    expect(() => resolveUserId([ws('wc-a', 'us-a')], 'wc-x')).toThrow(
      /workspace/i
    );
  });

  it('throws when ambiguous (multiple workspaces, none requested)', () => {
    const list = [ws('wc-a', 'us-a'), ws('wc-b', 'us-b')];
    expect(() => resolveUserId(list, undefined)).toThrow(/workspace_id/i);
  });
});
