// ABOUTME: Drag-to-reorder for a database view's records: whether the reader may
// ABOUTME: reorder, and the drag source + drop target that move one record.
import { useCallback, useRef, useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';

import { LocalRecordNode } from '@colanode/client/types';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { DropEdge, positionForDrop } from '@colanode/ui/lib/record-position';

export const RECORD_DND_TYPE = 'database-record';

export const useRecordReorder = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const canEdit = database.canEdit && !database.isLocked;
  // A view's own sort decides its order: a hand-made one would not show.
  const sorted = view.sorts.length > 0;
  const canReorder = canEdit && !sorted;

  const setPosition = useCallback(
    (recordId: string, position: string) => {
      workspace.collections.nodes.update(recordId, (draft) => {
        if (draft.type !== 'record' || draft.position === position) {
          return;
        }
        draft.position = position;
      });
    },
    [workspace]
  );

  // Move a record next to the one it was dropped on (or last, with null),
  // among the records as the view shows them.
  const move = useCallback(
    (
      draggedId: string,
      targetId: string | null,
      edge: DropEdge,
      ordered: readonly LocalRecordNode[]
    ) => {
      if (!canReorder) {
        return;
      }
      setPosition(
        draggedId,
        positionForDrop(ordered, draggedId, targetId, edge)
      );
    },
    [canReorder, setPosition]
  );

  return {
    canReorder,
    hint: canEdit && sorted ? 'Remove the sort to reorder by hand' : null,
    move,
    setPosition,
  };
};

// The edge of `element` the pointer is nearer to, along the list's axis.
export const dropEdgeAt = (
  element: HTMLElement | null,
  point: { x: number; y: number } | null,
  axis: 'vertical' | 'horizontal'
): DropEdge => {
  if (!element || !point) {
    return 'after';
  }
  const rect = element.getBoundingClientRect();
  return axis === 'vertical'
    ? point.y < rect.top + rect.height / 2
      ? 'before'
      : 'after'
    : point.x < rect.left + rect.width / 2
      ? 'before'
      : 'after';
};

interface RecordDragDropOptions {
  record: { id: string };
  // The records as the view shows them, this one included.
  ordered: readonly LocalRecordNode[];
  axis: 'vertical' | 'horizontal';
}

// One record as both a drag source and a drop target: dropping another record
// on it puts that one just before or after it, by the half under the pointer.
export const useRecordDragDrop = ({
  record,
  ordered,
  axis,
}: RecordDragDropOptions) => {
  const reorder = useRecordReorder();
  const elementRef = useRef<HTMLDivElement | null>(null);
  const edgeRef = useRef<DropEdge>('after');
  const [edge, setEdge] = useState<DropEdge>('after');

  const [{ isDragging }, drag, preview] = useDrag({
    type: RECORD_DND_TYPE,
    item: { id: record.id },
    canDrag: () => reorder.canReorder,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver }, drop] = useDrop<{ id: string }, void, { isOver: boolean }>(
    {
      accept: RECORD_DND_TYPE,
      canDrop: (item) => reorder.canReorder && item.id !== record.id,
      hover: (_item, monitor) => {
        const next = dropEdgeAt(
          elementRef.current,
          monitor.getClientOffset(),
          axis
        );
        edgeRef.current = next;
        setEdge(next);
      },
      drop: (item) => {
        reorder.move(item.id, record.id, edgeRef.current, ordered);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }) && monitor.canDrop(),
      }),
    }
  );

  return {
    elementRef,
    drag,
    preview,
    drop,
    isDragging,
    dropEdge: isOver ? edge : null,
    canReorder: reorder.canReorder,
    hint: reorder.hint,
  };
};
