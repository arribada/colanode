import { PresenceKind } from '@colanode/core';

export type PresenceLeaveMutationInput = {
  type: 'presence.leave';
  userId: string;
  nodeId: string;
  rootId: string;
  workspaceId: string;
  kind: PresenceKind;
};

export type PresenceLeaveMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'presence.leave': {
      input: PresenceLeaveMutationInput;
      output: PresenceLeaveMutationOutput;
    };
  }
}
