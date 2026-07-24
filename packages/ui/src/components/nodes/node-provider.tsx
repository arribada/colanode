import { eq, useLiveQuery } from '@tanstack/react-db';
import { ReactNode } from 'react';

import { LocalNode } from '@colanode/client/types';
import { extractNodeRole } from '@colanode/core';
import { NodeContainerSkeleton } from '@colanode/ui/components/nodes/node-container-skeleton';
import { NodeContext, NodeContextValue } from '@colanode/ui/contexts/node';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

const buildContextValue = (
  node: LocalNode,
  parentContext: NodeContextValue | null,
  userId: string
): NodeContextValue => {
  const breadcrumb = parentContext
    ? [...parentContext.breadcrumb, node]
    : [node];
  const root = parentContext ? parentContext.root : node;

  // Resolve the role from the full ancestor chain (root -> node), not just
  // the root, so that node-level collaborators (e.g. on a page or database)
  // are honored in addition to space-level ones.
  const role = extractNodeRole(breadcrumb, userId);

  if (!role) {
    throw new Error('Node role not found');
  }

  return {
    node,
    breadcrumb,
    root,
    role,
  };
};

type NodeProviderProps = {
  nodeId: string;
  children: ReactNode;
};

export const NodeProvider = ({ nodeId, children }: NodeProviderProps) => {
  const workspace = useWorkspace();

  const nodeQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, nodeId))
        .findOne(),
    [workspace.userId, nodeId]
  );

  if (nodeQuery.isLoading) {
    return <NodeContainerSkeleton />;
  }

  const node = nodeQuery.data;
  if (!node) {
    return null;
  }

  if (node.parentId) {
    return (
      <NodeProvider nodeId={node.parentId}>
        <NodeContext.Consumer>
          {(parentContext) => {
            const value = buildContextValue(
              node,
              parentContext,
              workspace.userId
            );

            return (
              <NodeContext.Provider value={value}>
                {children}
              </NodeContext.Provider>
            );
          }}
        </NodeContext.Consumer>
      </NodeProvider>
    );
  }

  const value = buildContextValue(node, null, workspace.userId);
  return <NodeContext.Provider value={value}>{children}</NodeContext.Provider>;
};
