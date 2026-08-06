import { RichTextContent } from '@colanode/core';

export type DocumentSuggestionCreateMutationInput = {
  type: 'document.suggestion.create';
  userId: string;
  nodeId: string;
  // null ⇒ whole-document suggestion; otherwise the target top-level block id.
  blockId: string | null;
  scope: 'block' | 'document';
  // The proposed blocks: for 'block' scope, the replacement subtree rooted at
  // blockId; for 'document' scope, the whole document.
  proposedContent: RichTextContent;
  previewText: string;
};

export type DocumentSuggestionCreateMutationOutput = {
  id: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'document.suggestion.create': {
      input: DocumentSuggestionCreateMutationInput;
      output: DocumentSuggestionCreateMutationOutput;
    };
  }
}
