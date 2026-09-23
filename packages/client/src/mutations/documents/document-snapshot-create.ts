import { DocumentSnapshotOutput } from '@colanode/core';

export type DocumentSnapshotCreateMutationInput = {
  type: 'document.snapshot.create';
  userId: string;
  documentId: string;
  // The version tag the snapshot is cut under, and the changelog written with
  // it. Both optional: a snapshot can be cut just to keep a point in time.
  name?: string | null;
  note?: string | null;
};

export type DocumentSnapshotCreateMutationOutput = DocumentSnapshotOutput;

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'document.snapshot.create': {
      input: DocumentSnapshotCreateMutationInput;
      output: DocumentSnapshotCreateMutationOutput;
    };
  }
}
