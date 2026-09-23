import { DocumentUpdateSummary } from '@colanode/core';

// The document's recent edits as the SERVER holds them. The local
// `document.updates.list` only sees what this device still has, which is
// nothing once it has been handed a merged state.
export type DocumentServerUpdateListQueryInput = {
  type: 'document.server.update.list';
  documentId: string;
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'document.server.update.list': {
      input: DocumentServerUpdateListQueryInput;
      output: DocumentUpdateSummary[];
    };
  }
}
