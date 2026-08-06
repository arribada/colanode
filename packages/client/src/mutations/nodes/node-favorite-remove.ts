export type NodeFavoriteRemoveMutationInput = {
  type: 'node.favorite.remove';
  userId: string;
  nodeId: string;
};

export type NodeFavoriteRemoveMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.favorite.remove': {
      input: NodeFavoriteRemoveMutationInput;
      output: NodeFavoriteRemoveMutationOutput;
    };
  }
}
