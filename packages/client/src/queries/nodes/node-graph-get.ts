import { GraphEdgeMode, NodeGraph } from '@colanode/client/lib/graph';

export type NodeGraphGetQueryInput = {
  type: 'node.graph.get';
  userId: string;
  edgeMode: GraphEdgeMode;
  includeOrphans: boolean;
  // Present for a local graph: keep only what is reachable from this node
  // within `depth` hops. Absent for the whole-workspace graph.
  focusNodeId?: string | null;
  depth?: number;
  // Most nodes to draw; the rest are left out and the view says so.
  maxNodes?: number;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.graph.get': {
      input: NodeGraphGetQueryInput;
      output: NodeGraph;
    };
  }
}
