export type NodeShareItem = {
  id: string;
  token: string;
  includeSubpages: boolean;
  hasPassword: boolean;
  expiresAt: string | null;
  createdAt: string;
};

export type NodeShareListMutationInput = {
  type: 'node.share.list';
  userId: string;
  nodeId: string;
};

export type NodeShareListMutationOutput = {
  shares: NodeShareItem[];
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.share.list': {
      input: NodeShareListMutationInput;
      output: NodeShareListMutationOutput;
    };
  }
}
