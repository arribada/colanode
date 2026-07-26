import { McpTokenCreateOutput } from '@colanode/core';

export type McpTokenCreateMutationInput = {
  type: 'ai.mcp.token.create';
  userId: string;
  // Optional human-friendly label (e.g. "Claude Desktop").
  name?: string;
};

export type McpTokenCreateMutationOutput = McpTokenCreateOutput;

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'ai.mcp.token.create': {
      input: McpTokenCreateMutationInput;
      output: McpTokenCreateMutationOutput;
    };
  }
}
