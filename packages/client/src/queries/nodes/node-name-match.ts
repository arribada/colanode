import { NamedNode } from '@colanode/client/lib/node-names';
import { NodeType } from '@colanode/core';

export type { NamedNode } from '@colanode/client/lib/node-names';

export type NodeNameMatchQueryInput = {
  type: 'node.name.match';
  userId: string;
  rootId: string;
  name: string;
  excludeId?: string;
  types?: NodeType[];
  limit?: number;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.name.match': {
      input: NodeNameMatchQueryInput;
      output: NamedNode[];
    };
  }
}
