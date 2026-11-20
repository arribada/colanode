// ABOUTME: The side panel of the search dialog: who made a node and when, how many
// ABOUTME: times the query shows in it, and every passage where it does.
import { NodeType, SearchTextRange } from '@colanode/core';

export type NodeSearchPassage = {
  text: string;
  highlights: SearchTextRange[];
  // What a find bar opened on the page looks for to land on this passage, and
  // which of its matches (0-based) this passage is. Null for a passage of the
  // name or of a record's values, which are not in the page body.
  findText: string | null;
  findOccurrence: number | null;
  source: 'name' | 'values' | 'content';
};

export type NodeSearchPreview = {
  id: string;
  type: NodeType;
  name: string | null;
  avatar: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
  wordCount: number;
  // The opening of the body, for a node the query does not point into.
  opening: string | null;
  matchCount: number;
  passages: NodeSearchPassage[];
  // More passages than were returned.
  passagesTruncated: boolean;
};

export type NodeSearchPreviewQueryInput = {
  type: 'node.search.preview';
  userId: string;
  nodeId: string;
  searchQuery: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.search.preview': {
      input: NodeSearchPreviewQueryInput;
      output: NodeSearchPreview | null;
    };
  }
}
