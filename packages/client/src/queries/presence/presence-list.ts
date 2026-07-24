import { PresenceState } from '@colanode/core';

export type PresenceListQueryInput = {
  type: 'presence.list';
  userId: string;
  nodeId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'presence.list': {
      input: PresenceListQueryInput;
      output: PresenceState[];
    };
  }
}
