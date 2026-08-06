export type NodeShareCreateMutationInput = {
  type: 'node.share.create';
  userId: string;
  nodeId: string;
  permission: 'read' | 'suggest';
  includeSubpages: boolean;
  password: string | null;
  expiresInDays: number | null;
};

export type NodeShareCreateMutationOutput = {
  id: string;
  token: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.share.create': {
      input: NodeShareCreateMutationInput;
      output: NodeShareCreateMutationOutput;
    };
  }
}
