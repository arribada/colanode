import { PresenceKind, PresencePayload } from '@colanode/core';

export type PresenceUpdateMutationInput = {
  type: 'presence.update';
  userId: string;
  nodeId: string;
  rootId: string;
  workspaceId: string;
  kind: PresenceKind;
  name: string;
  color: string;
  avatar?: string | null;
  payload: PresencePayload;
};

export type PresenceUpdateMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'presence.update': {
      input: PresenceUpdateMutationInput;
      output: PresenceUpdateMutationOutput;
    };
  }
}
