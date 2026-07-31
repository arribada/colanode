import { inArray, useLiveQuery } from '@tanstack/react-db';
import { ReactNode, useMemo } from 'react';

import { LocalNode, LocalSpaceNode } from '@colanode/client/types';
import { compareString } from '@colanode/core';
import {
  SidebarTree,
  SidebarTreeContext,
} from '@colanode/ui/contexts/sidebar-tree';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

// Every node type the sidebar knows how to draw. Anything else (files, records,
// messages) never appears in the tree, so it stays out of the index.
const SIDEBAR_NODE_TYPES = [
  'space',
  'channel',
  'chat',
  'page',
  'database',
  'database_view',
  'folder',
  'whiteboard',
];

const NO_CHILDREN: LocalNode[] = [];

/**
 * Holds the whole sidebar tree behind a single live query.
 *
 * Each row used to ask the collection for its own children — including collapsed
 * pages, which query purely to decide whether to draw a chevron. That is one
 * incremental view per visible row (a few dozen on this workspace), each
 * re-scanning the same node collection and each maintained on every sync tick.
 * On a phone it was the difference between a sidebar that opens and one that
 * hangs. One query plus an in-memory index answers the same questions.
 */
export const SidebarTreeProvider = ({ children }: { children: ReactNode }) => {
  const workspace = useWorkspace();

  const treeQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => inArray(nodes.type, SIDEBAR_NODE_TYPES)),
    [workspace.userId]
  );

  const nodes = treeQuery.data;
  const isLoading = treeQuery.isLoading;

  const value = useMemo<SidebarTree>(() => {
    const byId = new Map<string, LocalNode>();
    const byParent = new Map<string, LocalNode[]>();
    const spaces: LocalSpaceNode[] = [];

    for (const node of (nodes ?? []) as LocalNode[]) {
      byId.set(node.id, node);

      if (node.type === 'space') {
        spaces.push(node);
        continue;
      }

      if (!node.parentId) {
        continue;
      }

      const siblings = byParent.get(node.parentId);
      if (siblings) {
        siblings.push(node);
      } else {
        byParent.set(node.parentId, [node]);
      }
    }

    // The per-row queries this replaced all ended in `orderBy(id, 'asc')`;
    // sorting each bucket once keeps the tree in exactly the order it had.
    spaces.sort((a, b) => compareString(a.id, b.id));
    for (const siblings of byParent.values()) {
      siblings.sort((a, b) => compareString(a.id, b.id));
    }

    return {
      spaces,
      isLoading,
      childrenOf: (parentId) => byParent.get(parentId) ?? NO_CHILDREN,
      hasChildren: (parentId) => byParent.has(parentId),
      nodeById: (id) => byId.get(id),
      isDescendantOf: (nodeId, ancestorId) => {
        // Walk up rather than down: depth is a handful of levels, while the
        // subtree under a space can be hundreds of pages.
        let parentId = byId.get(nodeId)?.parentId ?? null;
        while (parentId) {
          if (parentId === ancestorId) {
            return true;
          }
          parentId = byId.get(parentId)?.parentId ?? null;
        }

        return false;
      },
    };
  }, [nodes, isLoading]);

  return (
    <SidebarTreeContext.Provider value={value}>
      {children}
    </SidebarTreeContext.Provider>
  );
};
