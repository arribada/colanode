export type NodeFavoriteAddMutationInput = {
  type: 'node.favorite.add';
  userId: string;
  nodeId: string;
};

export type NodeFavoriteAddMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.favorite.add': {
      input: NodeFavoriteAddMutationInput;
      output: NodeFavoriteAddMutationOutput;
    };
  }
}
