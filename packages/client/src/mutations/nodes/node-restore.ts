export type NodeRestoreMutationInput = {
  type: 'node.restore';
  userId: string;
  nodeId: string;
};

export type NodeRestoreMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.restore': {
      input: NodeRestoreMutationInput;
      output: NodeRestoreMutationOutput;
    };
  }
}
