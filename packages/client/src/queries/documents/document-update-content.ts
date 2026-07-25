import { DocumentContent } from '@colanode/core';

// Reconstructs the folded document content as of a specific per-edit update,
// so the Version history dialog can preview / restore a fine-grained point in
// time (finer than the periodic server snapshots). Runs entirely against the
// local workspace database (document_states + document_updates), so it is
// web-only and needs no server change.
export type DocumentUpdateContentQueryInput = {
  type: 'document.update.content';
  documentId: string;
  updateId: string;
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'document.update.content': {
      input: DocumentUpdateContentQueryInput;
      output: DocumentContent | null;
    };
  }
}
