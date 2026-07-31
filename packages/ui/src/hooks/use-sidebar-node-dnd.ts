import { Ref, useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { toast } from 'sonner';

import { mapNodeAttributes } from '@colanode/client/lib';
import {
  LocalDatabaseNode,
  LocalFolderNode,
  LocalNode,
  LocalPageNode,
  LocalWhiteboardNode,
} from '@colanode/client/types';
import { NodeAttributes } from '@colanode/core';
import {
  SidebarTree,
  useSidebarTree,
} from '@colanode/ui/contexts/sidebar-tree';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';

export const SIDEBAR_NODE_DND_TYPE = 'sidebar-node';

export interface SidebarNodeDragItem {
  id: string;
  name: string;
  rootId: string;
  parentId: string | null;
}

type MovableNode =
  LocalPageNode | LocalFolderNode | LocalDatabaseNode | LocalWhiteboardNode;

/** The rows you can pick up: content that lives under a space and can be re-filed. */
const isMovableType = (type: string): boolean =>
  type === 'page' ||
  type === 'folder' ||
  type === 'database' ||
  type === 'whiteboard';

const isMovable = (node: LocalNode): node is MovableNode =>
  isMovableType(node.type);

const attributesWithParent = (
  node: MovableNode,
  parentId: string
): NodeAttributes =>
  // Every draggable type carries a parentId, but mapNodeAttributes widens back
  // to the whole union — which includes the two types that have no parent at all
  // (space, chat) — so the result has to be named again.
  ({ ...mapNodeAttributes(node), parentId }) as NodeAttributes;

const canMoveInto = (
  item: SidebarNodeDragItem,
  target: LocalNode,
  tree: SidebarTree
): boolean => {
  if (item.id === target.id) {
    return false;
  }

  // Already where it would land.
  if (item.parentId === target.id) {
    return false;
  }

  // A move rewrites parentId only — the server leaves root_id alone — so a node
  // dragged into another space would keep answering to the permissions of the
  // space it left. The Move dialog draws exactly the same line.
  if (item.rootId !== target.rootId) {
    return false;
  }

  // Dropping a branch inside itself would cut it off from every space.
  return !tree.isDescendantOf(target.id, item.id);
};

interface SidebarNodeDndOptions {
  /**
   * Whether this row accepts a drop. Spaces and pages do; folders hold files and
   * the sidebar never lists their contents, so a page dropped in one would
   * silently vanish from the tree.
   */
  droppable?: boolean;
}

/**
 * Makes a sidebar row draggable, droppable, or both. Moving a node is a plain
 * attribute change: nothing addresses a page by its path — links, mentions and
 * URLs all carry the node id — so re-filing one cannot break a reference to it.
 */
export const useSidebarNodeDnd = (
  node: LocalNode,
  options?: SidebarNodeDndOptions
) => {
  const workspace = useWorkspace();
  const tree = useSidebarTree();
  const { mutate } = useMutation();

  const droppable = options?.droppable ?? false;
  const canEdit = workspace.role !== 'guest' && workspace.role !== 'none';
  const name = ('name' in node ? node.name : null) ?? 'Unnamed';

  const [{ isDragging }, drag] = useDrag({
    type: SIDEBAR_NODE_DND_TYPE,
    canDrag: () => canEdit && isMovableType(node.type),
    item: (): SidebarNodeDragItem => ({
      id: node.id,
      name,
      rootId: node.rootId,
      parentId: node.parentId,
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: SIDEBAR_NODE_DND_TYPE,
    canDrop: (item: SidebarNodeDragItem) =>
      droppable && canEdit && canMoveInto(item, node, tree),
    drop: (item: SidebarNodeDragItem, monitor) => {
      // Pages nest, so drop targets nest too — only the innermost one acts.
      if (monitor.didDrop()) {
        return;
      }

      const dragged = tree.nodeById(item.id);
      if (!dragged || !isMovable(dragged)) {
        return;
      }

      mutate({
        input: {
          type: 'node.update',
          userId: workspace.userId,
          nodeId: dragged.id,
          attributes: attributesWithParent(dragged, node.id),
        },
        onSuccess: (output) => {
          if (!output.success) {
            toast.error(`Couldn't move "${item.name}"`);
          }
        },
        onError: () => {
          toast.error(`Couldn't move "${item.name}"`);
        },
      });
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  });

  const rowRef = useRef<HTMLDivElement>(null);

  return {
    ref: drop(drag(rowRef)) as Ref<HTMLDivElement>,
    isDragging,
    isDropTarget: isOver && canDrop,
  };
};
