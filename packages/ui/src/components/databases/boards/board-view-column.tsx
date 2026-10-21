import { useRef } from 'react';
import { useDrop } from 'react-dnd';

import { BoardViewColumnRecords } from '@colanode/ui/components/databases/boards/board-view-column-records';
import { DropIndicator } from '@colanode/ui/components/databases/drop-indicator';
import { useBoardView } from '@colanode/ui/contexts/board-view';
import { useReorderItem } from '@colanode/ui/hooks/use-index-reorder';
import { cn } from '@colanode/ui/lib/utils';

export const BoardViewColumn = () => {
  const boardView = useBoardView();

  const filterValue =
    boardView.filter.type === 'field' ? boardView.filter.value : undefined;
  const columnId =
    Array.isArray(filterValue) && filterValue[0]
      ? filterValue[0]
      : `${boardView.field.id}-none`;

  const [{ isOver }, drop] = useDrop({
    accept: 'board-record',
    drop: (item, monitor) => {
      // A card or the column's tail took the drop, with the record's new
      // place: keep their result rather than overwrite it.
      if (monitor.didDrop()) {
        return undefined;
      }
      const value = boardView.drop(item);
      return {
        value,
      };
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
    canDrop: boardView.canDrop,
  });

  // The header drags the whole column among the others (a select option's).
  const reorderColumn = boardView.columnReorder;
  const columnDnd = useReorderItem({
    type: `board-column:${boardView.field.id}`,
    id: reorderColumn?.id ?? columnId,
    axis: 'horizontal',
    enabled: !!reorderColumn?.canReorder,
    onMove: (draggedId, targetId, edge) =>
      reorderColumn?.move(draggedId, targetId, edge),
  });

  const divRef = useRef<HTMLDivElement | null>(null);
  const columnClass = boardView.columnClass ?? 'bg-muted/40';

  return (
    <div
      ref={(node) => {
        divRef.current = node;
        drop(node);
        columnDnd.elementRef.current = node;
        columnDnd.drop(node);
        columnDnd.preview(node);
      }}
      className={cn(
        'relative isolate flex min-h-[400px] flex-col rounded-xl p-2 transition-colors',
        columnDnd.isDragging && 'opacity-40',
        isOver &&
          (boardView.dragOverClass && boardView.dragOverClass.length > 0
            ? boardView.dragOverClass
            : 'ring-2 ring-inset ring-primary/40')
      )}
      style={{
        minWidth: '272px',
        maxWidth: '272px',
        width: '272px',
      }}
    >
      {/* Soft tag-colour wash behind the column. The colour itself is already a
          pale 50-shade on the light theme, and a quarter of it over white was
          not far from invisible; it is shown as it is there, and stays faint on
          the dark theme, where a 900-shade at full strength would shout. */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 -z-10 rounded-xl opacity-100 dark:opacity-25',
          columnClass
        )}
      />
      <DropIndicator edge={columnDnd.dropEdge} axis="horizontal" />
      <div
        ref={(node) => {
          columnDnd.drag(node);
        }}
        title={
          reorderColumn?.canReorder ? 'Drag to reorder columns' : undefined
        }
        className={cn(
          'flex min-w-0 flex-row items-center gap-2 px-1 py-0.5',
          reorderColumn?.canReorder && 'cursor-grab'
        )}
      >
        {boardView.header}
      </div>
      <BoardViewColumnRecords columnId={columnId} />
    </div>
  );
};
