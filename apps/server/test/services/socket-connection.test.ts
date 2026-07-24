import { describe, expect, it } from 'vitest';

import { canRelayPresenceToConnection } from '@colanode/server/services/socket-connection';

describe('presence relay authorization', () => {
  it('delivers presence to a connection whose user collaborates on the root', () => {
    const users = [{ rootIds: new Set(['root-a']) }];
    expect(canRelayPresenceToConnection(users, 'root-a')).toBe(true);
  });

  it('does NOT deliver presence for a root the connection has no access to', () => {
    const users = [{ rootIds: new Set(['root-a']) }];
    expect(canRelayPresenceToConnection(users, 'root-b')).toBe(false);
  });

  it('delivers when any one of several users has access', () => {
    const users = [
      { rootIds: new Set(['root-a']) },
      { rootIds: new Set(['root-b', 'root-c']) },
    ];
    expect(canRelayPresenceToConnection(users, 'root-c')).toBe(true);
  });

  it('does NOT deliver to a connection with no users', () => {
    expect(canRelayPresenceToConnection([], 'root-a')).toBe(false);
  });

  it('does NOT deliver to a connection whose users have empty root sets', () => {
    const users = [{ rootIds: new Set<string>() }];
    expect(canRelayPresenceToConnection(users, 'root-a')).toBe(false);
  });
});
