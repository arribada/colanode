import { createContext, useContext } from 'react';

import { LocalNode, LocalSpaceNode } from '@colanode/client/types';

export interface SidebarTree {
  /** Every space, ordered by id — the roots the sidebar draws from. */
  spaces: LocalSpaceNode[];
  isLoading: boolean;
  /**
   * Direct children of a node, ordered by id. The same array instance is
   * returned for the same parent until the tree itself changes, so callers can
   * safely use it as a memo dependency.
   */
  childrenOf: (parentId: string) => LocalNode[];
  hasChildren: (parentId: string) => boolean;
  nodeById: (id: string) => LocalNode | undefined;
  /**
   * True when `nodeId` sits anywhere under `ancestorId`. This is what stops a
   * drag from dropping a branch inside itself, which would detach it from every
   * space and make it unreachable.
   */
  isDescendantOf: (nodeId: string, ancestorId: string) => boolean;
}

export const SidebarTreeContext = createContext<SidebarTree | null>(null);

export const useSidebarTree = (): SidebarTree => {
  const tree = useContext(SidebarTreeContext);
  if (!tree) {
    throw new Error('useSidebarTree must be used within a SidebarTreeProvider');
  }

  return tree;
};
