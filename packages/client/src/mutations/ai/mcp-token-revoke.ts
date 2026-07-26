import { McpTokenRevokeOutput } from '@colanode/core';

export type McpTokenRevokeMutationInput = {
  type: 'ai.mcp.token.revoke';
  userId: string;
  tokenId: string;
};

export type McpTokenRevokeMutationOutput = McpTokenRevokeOutput;

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'ai.mcp.token.revoke': {
      input: McpTokenRevokeMutationInput;
      output: McpTokenRevokeMutationOutput;
    };
  }
}
