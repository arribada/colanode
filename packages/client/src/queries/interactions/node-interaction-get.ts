import { NodeInteraction } from '@colanode/client/types/nodes';

export type NodeInteractionGetQueryInput = {
  type: 'node.interaction.get';
  nodeId: string;
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.interaction.get': {
      input: NodeInteractionGetQueryInput;
      output: NodeInteraction | null;
    };
  }
}
