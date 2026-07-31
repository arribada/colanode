import { LocalNode } from '@colanode/client/types/nodes';
import { NodeType } from '@colanode/core';

export type NodeMentionSearchQueryInput = {
  type: 'node.mention.search';
  searchQuery: string;
  userId: string;
  types?: NodeType[];
  exclude?: string[];
  limit?: number;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.mention.search': {
      input: NodeMentionSearchQueryInput;
      output: LocalNode[];
    };
  }
}
