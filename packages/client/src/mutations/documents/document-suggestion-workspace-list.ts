export type DocumentSuggestionWorkspaceItem = {
  id: string;
  nodeId: string;
  pageName: string;
  scope: 'block' | 'document';
  origin: 'member' | 'external';
  authorName: string | null;
  previewText: string | null;
  createdAt: string;
};

export type DocumentSuggestionWorkspaceListMutationInput = {
  type: 'document.suggestion.workspace.list';
  userId: string;
};

export type DocumentSuggestionWorkspaceListMutationOutput = {
  total: number;
  suggestions: DocumentSuggestionWorkspaceItem[];
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'document.suggestion.workspace.list': {
      input: DocumentSuggestionWorkspaceListMutationInput;
      output: DocumentSuggestionWorkspaceListMutationOutput;
    };
  }
}
