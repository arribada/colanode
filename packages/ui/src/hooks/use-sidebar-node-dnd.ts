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
import { useNodeUndo } from '@colanode/ui/contexts/node-undo';
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
  type: string;
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

// A move into a target: allowed when the target is a different node that isn't
// already the item's parent and isn't sitting inside the item's own subtree. The
// target may live in a different space — the server re-homes the whole subtree's
// root_id in the same transaction, so a cross-space drop is just a re-parent.
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

  return !tree.isDescendantOf(target.id, item.id);
};

interface SidebarNodeDndOptions {
  /**
   * Whether this row accepts a drop *inside* it (re-parenting). Spaces, pages and
   * folders all do — each lists its child nodes in the sidebar, so a node dropped
   * in one stays visible in the tree. Every movable row still accepts a drop
   * *before/after* it for reordering, regardless of this flag.
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
  const { push: pushUndo } = useNodeUndo();

  const droppable = options?.droppable ?? false;
  const canEdit = workspace.role !== 'guest' && workspace.role !== 'none';
  const name = ('name' in node ? node.name : null) ?? 'Unnamed';

  // Reordering writes a fractional `index` on the node, which the sidebar tree
  // sorts by. Space children order through the space's own `children` map
  // instead (sortSpaceChildren), so a node parented directly to a space isn't
  // reorderable here — it only accepts a drop *inside* it, as before.
  // A page/folder/etc. is reorderable among its siblings by writing its own
  // fractional `index` — including at the top level of a space (space children
  // are sorted by that same index, so reorder + the drop-edge indicator work
  // there too, not only for nested pages).
  const reorderable = isMovableType(node.type);

  const rowRef = useRef<HTMLDivElement>(null);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);

  const [{ isDragging }, drag] = useDrag({
    type: SIDEBAR_NODE_DND_TYPE,
    canDrag: () =>
      canEdit && (isMovableType(node.type) || node.type === 'space'),
    item: (): SidebarNodeDragItem => ({
      id: node.id,
      name,
      rootId: node.rootId,
      parentId: parentIdOf(node),
      type: node.type,
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  // Where the pointer sits over the row decides the action. The middle band of a
  // droppable row re-parents; the top/bottom bands (or the whole row, when it is
  // not droppable) reorder.
  const zoneFor = (monitor: DropTargetMonitor): DropZone => {
    const draggedItem = monitor.getItem() as SidebarNodeDragItem | null;
    // Reordering a space: only ever before/after another space, never 'inside'.
    if (draggedItem?.type === 'space') {
      const spaceRect = rowRef.current?.getBoundingClientRect();
      const spaceOffset = monitor.getClientOffset();
      if (!spaceRect || !spaceOffset || spaceRect.height === 0) {
        return 'after';
      }
      return (spaceOffset.y - spaceRect.top) / spaceRect.height < 0.5
        ? 'before'
        : 'after';
    }
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

  // `undo`, when given, is the patch that puts the node back where it was.
  // After a successful move we surface it as a toast "Undo" button and register
  // it on the global undo stack (Ctrl/Cmd-Z). Replaying through this same helper
  // with no `undo` reverts silently and can't loop.
  const updateNode = (
    target: LocalNode,
    patch: { parentId?: string; index?: string },
    label: string,
    undo?: { parentId?: string; index?: string }
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
          return;
        }
        if (!undo) {
          return;
        }
        const revert = () => updateNode(target, undo, label);
        pushUndo(revert);
        toast(`Moved "${label}"`, {
          action: {
            label: 'Undo',
            onClick: revert,
          },
        });
      },
      onError: () => {
        toast.error(`Couldn't move "${label}"`);
      },
    });
  };

  const performDrop = (
    item: SidebarNodeDragItem,
    dragged: LocalNode,
    zone: DropZone
  ) => {
    // Reordering a space among the other spaces: write a fractional `index` on
    // the dragged space (it is never re-parented).
    if (dragged.type === 'space') {
      if (node.type !== 'space' || zone === 'inside') {
        return;
      }
      const oldSpaceIndex = tree.childKey(dragged.id);
      const orderedSpaces = tree.spaces.filter((s) => s.id !== dragged.id);
      const spacePos = orderedSpaces.findIndex((s) => s.id === node.id);
      if (spacePos === -1) {
        return;
      }
      const beforeSpace =
        zone === 'before' ? orderedSpaces[spacePos - 1] : node;
      const afterSpace = zone === 'before' ? node : orderedSpaces[spacePos + 1];
      const lowSpaceKey = beforeSpace
        ? (tree.childKey(beforeSpace.id) ?? null)
        : null;
      const highSpaceKey = afterSpace
        ? (tree.childKey(afterSpace.id) ?? null)
        : null;
      let nextIndex: string;
      try {
        nextIndex = generateFractionalIndex(lowSpaceKey, highSpaceKey);
      } catch {
        toast.error(`Couldn't reorder "${item.name}"`);
        return;
      }
      updateNode(
        dragged,
        { index: nextIndex },
        item.name,
        oldSpaceIndex !== undefined ? { index: oldSpaceIndex } : undefined
      );
      return;
    }

    // Capture where the dragged node currently sits so the move can be undone.
    const oldParentId = parentIdOf(dragged);
    const oldIndex = tree.childKey(dragged.id);
    const undoPatch: { parentId?: string; index?: string } = {};
    if (oldParentId !== null) {
      undoPatch.parentId = oldParentId;
    }
    if (oldIndex !== undefined) {
      undoPatch.index = oldIndex;
    }
    const undo = undoPatch.parentId !== undefined ? undoPatch : undefined;

    if (zone === 'inside') {
      if (!droppable || !canMoveInto(item, node, tree)) {
        return;
      }
      updateNode(dragged, { parentId: node.id }, item.name, undo);
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

    updateNode(dragged, { parentId, index: newIndex }, item.name, undo);
  };

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: SIDEBAR_NODE_DND_TYPE,
    canDrop: (item: SidebarNodeDragItem) => {
      if (!canEdit || item.id === node.id) {
        return false;
      }
      // A space can only be reordered relative to another space.
      if (item.type === 'space') {
        return node.type === 'space';
      }
      return (
        !tree.isDescendantOf(node.id, item.id) &&
        // A reorderable row accepts a reorder (before/after); a droppable row
        // (page, space) also accepts a drop inside it.
        (reorderable || (droppable && canMoveInto(item, node, tree)))
      );
    },
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
      if (!dragged || (dragged.type !== 'space' && !isMovable(dragged))) {
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
