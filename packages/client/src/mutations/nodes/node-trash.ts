export type NodeTrashMutationInput = {
  type: 'node.trash';
  userId: string;
  nodeId: string;
};

export type NodeTrashMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.trash': {
      input: NodeTrashMutationInput;
      output: NodeTrashMutationOutput;
    };
  }
}
