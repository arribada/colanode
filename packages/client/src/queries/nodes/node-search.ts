import { NodeType } from '@colanode/core';

export type NodeSearchMatchSource = 'name' | 'content';

export type NodeSearchResult = {
  id: string;
  type: NodeType;
  name: string | null;
  avatar: string | null;
  rootId: string;
  spaceName: string | null;
  snippet: string | null;
  matchedIn: NodeSearchMatchSource;
};

export type NodeSearchQueryInput = {
  type: 'node.search';
  searchQuery: string;
  userId: string;
  limit?: number;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.search': {
      input: NodeSearchQueryInput;
      output: NodeSearchResult[];
    };
  }
}
