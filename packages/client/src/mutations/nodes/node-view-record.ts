export type NodeViewRecordMutationInput = {
  type: 'node.view.record';
  userId: string;
  nodeId: string;
};

export type NodeViewRecordMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.view.record': {
      input: NodeViewRecordMutationInput;
      output: NodeViewRecordMutationOutput;
    };
  }
}
