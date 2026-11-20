import { NodeType, SearchTextRange } from '@colanode/core';

export type NodeSearchMatchSource = 'name' | 'content';

// The orders Notion offers: best match first, or by date either way.
export type NodeSearchSort =
  'relevance' | 'edited_desc' | 'edited_asc' | 'created_desc' | 'created_asc';

export type NodeSearchFilters = {
  // Only the names, not the page bodies or record values.
  titleOnly?: boolean;
  types?: NodeType[];
  createdBy?: string[];
  // A space, page, folder or database: the node and everything below it.
  withinId?: string | null;
  dateField?: 'edited' | 'created';
  // ISO instants; `dateTo` is exclusive.
  dateFrom?: string | null;
  dateTo?: string | null;
  // Chats and channels, and the messages posted in them. Page comments are
  // messages too and stay searchable either way.
  includeChat?: boolean;
};

export type NodeSearchResult = {
  id: string;
  type: NodeType;
  name: string | null;
  avatar: string | null;
  parentId: string | null;
  rootId: string;
  rootType: NodeType;
  spaceName: string | null;
  snippet: string | null;
  // Where the query shows in `snippet` and in `name`.
  snippetHighlights: SearchTextRange[];
  nameHighlights: SearchTextRange[];
  // How many times the query shows in the node: its name, its values and
  // its body together.
  matchCount: number;
  matchedIn: NodeSearchMatchSource;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type NodeSearchOutput = {
  results: NodeSearchResult[];
  // Every node the query and filters match, not only the ones returned.
  total: number;
};

export type NodeSearchQueryInput = {
  type: 'node.search';
  searchQuery: string;
  userId: string;
  limit?: number;
  sort?: NodeSearchSort;
  filters?: NodeSearchFilters;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.search': {
      input: NodeSearchQueryInput;
      output: NodeSearchOutput;
    };
  }
}
