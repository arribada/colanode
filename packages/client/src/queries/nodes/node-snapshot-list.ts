import { NodeSnapshotSummary } from '@colanode/core';

export type NodeSnapshotListQueryInput = {
  type: 'node.snapshot.list';
  nodeId: string;
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.snapshot.list': {
      input: NodeSnapshotListQueryInput;
      output: NodeSnapshotSummary[];
    };
  }
}
