export type NodeShareRevokeMutationInput = {
  type: 'node.share.revoke';
  userId: string;
  shareId: string;
};

export type NodeShareRevokeMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.share.revoke': {
      input: NodeShareRevokeMutationInput;
      output: NodeShareRevokeMutationOutput;
    };
  }
}
