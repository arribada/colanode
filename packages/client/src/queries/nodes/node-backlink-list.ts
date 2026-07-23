import { LocalNode } from '@colanode/client/types/nodes';

export type NodeBacklinkListQueryInput = {
  type: 'node.backlink.list';
  nodeId: string;
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.backlink.list': {
      input: NodeBacklinkListQueryInput;
      output: LocalNode[];
    };
  }
}
