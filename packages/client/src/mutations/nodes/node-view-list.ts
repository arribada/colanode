export type NodeViewEntry = {
  userId: string;
  // ISO timestamp of this user's most recent view (JSON-serialized Date).
  lastViewedAt: string;
  viewCount: number;
};

export type NodeViewListMutationInput = {
  type: 'node.view.list';
  userId: string;
  nodeId: string;
};

export type NodeViewListMutationOutput = {
  views: NodeViewEntry[];
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.view.list': {
      input: NodeViewListMutationInput;
      output: NodeViewListMutationOutput;
    };
  }
}
