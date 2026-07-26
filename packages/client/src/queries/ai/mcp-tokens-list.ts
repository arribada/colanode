import { McpTokensListOutput } from '@colanode/core';

export type McpTokensListQueryInput = {
  type: 'ai.mcp.tokens.list';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'ai.mcp.tokens.list': {
      input: McpTokensListQueryInput;
      output: McpTokensListOutput;
    };
  }
}
