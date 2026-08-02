import { Ref, useRef, useState } from 'react';
import { DropTargetMonitor, useDrag, useDrop } from 'react-dnd';
import { toast } from 'sonner';

import { mapNodeAttributes } from '@colanode/client/lib';
import {
  LocalDatabaseNode,
  LocalFolderNode,
  LocalNode,
  LocalPageNode,
  LocalWhiteboardNode,
} from '@colanode/client/types';
import { generateFractionalIndex, NodeAttributes } from '@colanode/core';
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

// 'inside' re-files the dragged node under this row; 'before'/'after' reorder it
// among this row's siblings.
type DropZone = 'before' | 'after' | 'inside';

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

const parentIdOf = (node: LocalNode): string | null =>
  'parentId' in node ? (node.parentId ?? null) : null;

// A move into a target: allowed only when the target is a different node, in the
// same space (the server never recomputes root_id), that isn't already the
// item's parent and isn't sitting inside the item's own subtree.
const canMoveInto = (
  item: SidebarNodeDragItem,
  target: LocalNode,
  tree: SidebarTree
): boolean => {
  if (item.id === target.id) {
    return false;
  }

  if (item.parentId === target.id) {
    return false;
  }

  if (item.rootId !== target.rootId) {
    return false;
  }

  return !tree.isDescendantOf(target.id, item.id);
};

interface SidebarNodeDndOptions {
  /**
   * Whether this row accepts a drop *inside* it (re-parenting). Spaces and pages
   * do; folders hold files and the sidebar never lists their contents, so a page
   * dropped in one would silently vanish from the tree. Every movable row still
   * accepts a drop *before/after* it for reordering, regardless of this flag.
   */
  droppable?: boolean;
}

/**
 * Makes a sidebar row draggable and a drop target. Dropping onto the middle of a
 * droppable row re-files the node inside it; dropping onto the top or bottom edge
 * reorders it among that row's siblings (persisted as a fractional `index`).
 * Moving a node is a plain attribute change: nothing addresses a page by its
 * path — links, mentions and URLs all carry the node id — so re-filing one can
 * never break a reference to it.
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

  // Reordering writes a fractional `index` on the node, which the sidebar tree
  // sorts by. Space children order through the space's own `children` map
  // instead (sortSpaceChildren), so a node parented directly to a space isn't
  // reorderable here — it only accepts a drop *inside* it, as before.
  const parentIsSpace =
    tree.nodeById(parentIdOf(node) ?? '')?.type === 'space';
  const reorderable = isMovableType(node.type) && !parentIsSpace;

  const rowRef = useRef<HTMLDivElement>(null);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);

  const [{ isDragging }, drag] = useDrag({
    type: SIDEBAR_NODE_DND_TYPE,
    canDrag: () => canEdit && isMovableType(node.type),
    item: (): SidebarNodeDragItem => ({
      id: node.id,
      name,
      rootId: node.rootId,
      parentId: parentIdOf(node),
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  // Where the pointer sits over the row decides the action. The middle band of a
  // droppable row re-parents; the top/bottom bands (or the whole row, when it is
  // not droppable) reorder.
  const zoneFor = (monitor: DropTargetMonitor): DropZone => {
    // Non-reorderable rows (a space, or a node parented to a space) only ever
    // accept a drop *inside* them, so the whole row is one 'inside' target.
    if (!reorderable) {
      return 'inside';
    }
    const rect = rowRef.current?.getBoundingClientRect();
    const offset = monitor.getClientOffset();
    if (!rect || !offset || rect.height === 0) {
      return droppable ? 'inside' : 'after';
    }
    const rel = (offset.y - rect.top) / rect.height;
    if (droppable && rel >= 0.33 && rel <= 0.67) {
      return 'inside';
    }
    return rel < 0.5 ? 'before' : 'after';
  };

  const updateNode = (
    target: MovableNode,
    patch: { parentId?: string; index?: string },
    label: string
  ) => {
    mutate({
      input: {
        type: 'node.update',
        userId: workspace.userId,
        nodeId: target.id,
        attributes: {
          ...mapNodeAttributes(target),
          ...patch,
        } as NodeAttributes,
      },
      onSuccess: (output) => {
        if (!output.success) {
          toast.error(`Couldn't move "${label}"`);
        }
      },
      onError: () => {
        toast.error(`Couldn't move "${label}"`);
      },
    });
  };

  const performDrop = (
    item: SidebarNodeDragItem,
    dragged: MovableNode,
    zone: DropZone
  ) => {
    if (zone === 'inside') {
      if (!droppable || !canMoveInto(item, node, tree)) {
        return;
      }
      updateNode(dragged, { parentId: node.id }, item.name);
      return;
    }

    // Reorder relative to this row, within this row's parent.
    const parentId = parentIdOf(node);
    if (
      !parentId ||
      parentId === dragged.id ||
      tree.isDescendantOf(parentId, dragged.id)
    ) {
      return;
    }

    const ordered = tree
      .childrenOf(parentId)
      .filter((sibling) => isMovable(sibling) && sibling.id !== dragged.id);
    const targetPos = ordered.findIndex((sibling) => sibling.id === node.id);
    if (targetPos === -1) {
      return;
    }

    const before = zone === 'before' ? ordered[targetPos - 1] : node;
    const after = zone === 'before' ? node : ordered[targetPos + 1];
    const lowKey = before ? (tree.childKey(before.id) ?? null) : null;
    const highKey = after ? (tree.childKey(after.id) ?? null) : null;

    // generateFractionalIndex (generateKeyBetween) throws when the bounds are
    // equal or out of order — reachable when a sibling carries a custom index
    // equal to another's positional default. Don't let it throw inside the
    // react-dnd drop handler: skip the reorder and tell the user.
    let newIndex: string;
    try {
      newIndex = generateFractionalIndex(lowKey, highKey);
    } catch {
      toast.error(`Couldn't reorder "${item.name}"`);
      return;
    }

    updateNode(dragged, { parentId, index: newIndex }, item.name);
  };

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: SIDEBAR_NODE_DND_TYPE,
    canDrop: (item: SidebarNodeDragItem) =>
      canEdit &&
      item.id !== node.id &&
      item.rootId === node.rootId &&
      !tree.isDescendantOf(node.id, item.id) &&
      // A reorderable row accepts a reorder (before/after); a droppable row
      // (page, space) also accepts a drop inside it.
      (reorderable || (droppable && canMoveInto(item, node, tree))),
    hover: (item: SidebarNodeDragItem, monitor) => {
      if (!monitor.isOver({ shallow: true }) || !monitor.canDrop()) {
        return;
      }
      const zone = zoneFor(monitor);
      setDropZone((prev) => (prev === zone ? prev : zone));
    },
    drop: (item: SidebarNodeDragItem, monitor) => {
      // Pages nest, so drop targets nest too — only the innermost one acts.
      if (monitor.didDrop()) {
        return;
      }

      const dragged = tree.nodeById(item.id);
      if (!dragged || !isMovable(dragged)) {
        return;
      }

      performDrop(item, dragged, zoneFor(monitor));
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  });

  const active = isOver && canDrop;
  // A line above/below the row when a node would land there in the order.
  const dropEdge: 'before' | 'after' | null =
    active && (dropZone === 'before' || dropZone === 'after')
      ? dropZone
      : null;

  return {
    ref: drop(drag(rowRef)) as Ref<HTMLDivElement>,
    isDragging,
    // Ring the row when a node would drop *inside* it.
    isDropInside: active && dropZone === 'inside',
    dropEdge,
  };
};
