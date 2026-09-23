export type NodeFetchMutationInput = {
  type: 'node.fetch';
  userId: string;
  nodeId: string;
};

export type NodeFetchMutationOutput = {
  nodes: number;
  documents: number;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.fetch': {
      input: NodeFetchMutationInput;
      output: NodeFetchMutationOutput;
    };
  }
}
