import { DocumentSnapshotOutput } from '@colanode/core';

export type DocumentSnapshotGetQueryInput = {
  type: 'document.snapshot.get';
  documentId: string;
  snapshotId: string;
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'document.snapshot.get': {
      input: DocumentSnapshotGetQueryInput;
      output: DocumentSnapshotOutput | null;
    };
  }
}
