import { LocalNode } from '@colanode/client/types/nodes';

export type NodeTrashListQueryInput = {
  type: 'node.trash.list';
  userId: string;
  limit?: number;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.trash.list': {
      input: NodeTrashListQueryInput;
      output: LocalNode[];
    };
  }
}
