import { NodeSnapshotOutput } from '@colanode/core';

export type NodeSnapshotGetQueryInput = {
  type: 'node.snapshot.get';
  nodeId: string;
  snapshotId: string;
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.snapshot.get': {
      input: NodeSnapshotGetQueryInput;
      output: NodeSnapshotOutput | null;
    };
  }
}
