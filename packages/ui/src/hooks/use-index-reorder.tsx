// ABOUTME: Drag-to-reorder for one item of a list kept by fractional index -- a
// ABOUTME: select option, a view tab, a property: drag source + before/after target.
import { useRef, useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';

import { dropEdgeAt } from '@colanode/ui/hooks/use-record-reorder';
import { ReorderEdge } from '@colanode/ui/lib/reorder-index';

interface ReorderItemOptions {
  // One drag type per list, so an option cannot be dropped among view tabs.
  type: string;
  id: string;
  axis: 'vertical' | 'horizontal';
  enabled: boolean;
  onMove: (draggedId: string, targetId: string, edge: ReorderEdge) => void;
}

export const useReorderItem = ({
  type,
  id,
  axis,
  enabled,
  onMove,
}: ReorderItemOptions) => {
  const elementRef = useRef<HTMLElement | null>(null);
  const edgeRef = useRef<ReorderEdge>('after');
  const [edge, setEdge] = useState<ReorderEdge>('after');

  const [{ isDragging }, drag, preview] = useDrag({
    type,
    item: { id },
    canDrag: () => enabled,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver }, drop] = useDrop<{ id: string }, void, { isOver: boolean }>(
    {
      accept: type,
      canDrop: (item) => enabled && item.id !== id,
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
        onMove(item.id, id, edgeRef.current);
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
  };
};
