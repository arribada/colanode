import { NodePaths } from '@colanode/client/lib/node-paths';

export type { NodePathSegment, NodePaths } from '@colanode/client/lib/node-paths';

export type NodePathListQueryInput = {
  type: 'node.path.list';
  userId: string;
  nodeIds: string[];
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.path.list': {
      input: NodePathListQueryInput;
      output: NodePaths;
    };
  }
}
