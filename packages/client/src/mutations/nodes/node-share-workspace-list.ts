export type WorkspaceShareItem = {
  id: string;
  token: string;
  nodeId: string;
  pageName: string;
  permission: string;
  hasPassword: boolean;
  includeSubpages: boolean;
  expiresAt: string | null;
  createdAt: string;
  pendingSuggestions: number;
};

export type NodeShareWorkspaceListMutationInput = {
  type: 'node.share.workspace.list';
  userId: string;
};

export type NodeShareWorkspaceListMutationOutput = {
  shares: WorkspaceShareItem[];
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.share.workspace.list': {
      input: NodeShareWorkspaceListMutationInput;
      output: NodeShareWorkspaceListMutationOutput;
    };
  }
}
