import { DocumentContent } from '@colanode/core';

export type DocumentRestoreMutationInput = {
  type: 'document.restore';
  userId: string;
  documentId: string;
  content: DocumentContent;
};

export type DocumentRestoreMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'document.restore': {
      input: DocumentRestoreMutationInput;
      output: DocumentRestoreMutationOutput;
    };
  }
}
