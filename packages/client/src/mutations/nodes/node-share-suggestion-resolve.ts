export type NodeShareSuggestionResolveMutationInput = {
  type: 'node.share.suggestion.resolve';
  userId: string;
  suggestionId: string;
  status: 'approved' | 'rejected';
};

export type NodeShareSuggestionResolveMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'node.share.suggestion.resolve': {
      input: NodeShareSuggestionResolveMutationInput;
      output: NodeShareSuggestionResolveMutationOutput;
    };
  }
}
