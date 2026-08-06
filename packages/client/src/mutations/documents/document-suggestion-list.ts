import { RichTextContent } from '@colanode/core';

export type DocumentSuggestionItem = {
  id: string;
  nodeId: string;
  blockId: string | null;
  scope: 'block' | 'document';
  proposedContent: RichTextContent;
  previewText: string | null;
  origin: 'member' | 'external';
  authorId: string | null;
  authorName: string | null;
  authorEmail: string | null;
  createdAt: string;
};

export type DocumentSuggestionListMutationInput = {
  type: 'document.suggestion.list';
  userId: string;
  nodeId: string;
};

export type DocumentSuggestionListMutationOutput = {
  suggestions: DocumentSuggestionItem[];
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'document.suggestion.list': {
      input: DocumentSuggestionListMutationInput;
      output: DocumentSuggestionListMutationOutput;
    };
  }
}
