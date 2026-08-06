export type DocumentSuggestionResolveMutationInput = {
  type: 'document.suggestion.resolve';
  userId: string;
  suggestionId: string;
  status: 'accepted' | 'rejected';
};

export type DocumentSuggestionResolveMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'document.suggestion.resolve': {
      input: DocumentSuggestionResolveMutationInput;
      output: DocumentSuggestionResolveMutationOutput;
    };
  }
}
