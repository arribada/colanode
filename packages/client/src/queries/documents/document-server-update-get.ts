import { DocumentUpdateContentOutput } from '@colanode/core';

export type DocumentServerUpdateGetQueryInput = {
  type: 'document.server.update.get';
  documentId: string;
  updateId: string;
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'document.server.update.get': {
      input: DocumentServerUpdateGetQueryInput;
      output: DocumentUpdateContentOutput | null;
    };
  }
}
