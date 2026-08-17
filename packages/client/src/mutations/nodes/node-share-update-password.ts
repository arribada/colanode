export type NodeShareUpdatePasswordMutationInput = {
  type: 'node.share.update.password';
  userId: string;
  shareId: string;
  // null clears the password (makes the link public again); a string rotates it.
  password: string | null;
};

export type NodeShareUpdatePasswordMutationOutput = {
  success: boolean;
  hasPassword: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.share.update.password': {
      input: NodeShareUpdatePasswordMutationInput;
      output: NodeShareUpdatePasswordMutationOutput;
    };
  }
}
