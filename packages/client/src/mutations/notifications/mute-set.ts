export type MuteSetMutationInput = {
  type: 'mute.set';
  userId: string;
  nodeId: string;
  muted: boolean;
};

export type MuteSetMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'mute.set': {
      input: MuteSetMutationInput;
      output: MuteSetMutationOutput;
    };
  }
}
