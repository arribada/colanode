export type ShareSuggestionItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  proposedHtml: string;
  proposedText: string | null;
  createdAt: string;
};

export type NodeShareSuggestionsListMutationInput = {
  type: 'node.share.suggestions.list';
  userId: string;
  nodeId: string;
};

export type NodeShareSuggestionsListMutationOutput = {
  suggestions: ShareSuggestionItem[];
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.share.suggestions.list': {
      input: NodeShareSuggestionsListMutationInput;
      output: NodeShareSuggestionsListMutationOutput;
    };
  }
}
