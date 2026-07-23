import { DocumentSnapshotSummary } from '@colanode/core';

export type DocumentSnapshotListQueryInput = {
  type: 'document.snapshot.list';
  documentId: string;
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'document.snapshot.list': {
      input: DocumentSnapshotListQueryInput;
      output: DocumentSnapshotSummary[];
    };
  }
}
