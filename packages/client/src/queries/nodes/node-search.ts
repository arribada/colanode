import { LocalNode } from '@colanode/client/types/nodes';
import { NodeType } from '@colanode/core';

export type NodeSearchQueryInput = {
  type: 'node.search';
  searchQuery: string;
  userId: string;
  types?: NodeType[];
  exclude?: string[];
  limit?: number;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.search': {
      input: NodeSearchQueryInput;
      output: LocalNode[];
    };
  }
}
