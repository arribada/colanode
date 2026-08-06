export type NodeFavoriteListMutationInput = {
  type: 'node.favorite.list';
  userId: string;
};

export type NodeFavoriteListMutationOutput = {
  nodeIds: string[];
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.favorite.list': {
      input: NodeFavoriteListMutationInput;
      output: NodeFavoriteListMutationOutput;
    };
  }
}
