import { useMemo, useRef } from 'react';
import { useDrop } from 'react-dnd';
import { InView } from 'react-intersection-observer';

import { extractNodeRole } from '@colanode/core';
import { BoardViewColumnSummary } from '@colanode/ui/components/databases/boards/board-view-column-summary';
import { BoardViewRecordCard } from '@colanode/ui/components/databases/boards/board-view-record-card';
import { BoardViewRecordCreateCard } from '@colanode/ui/components/databases/boards/board-view-record-create-card';
import { DropIndicator } from '@colanode/ui/components/databases/drop-indicator';
import { RecordProvider } from '@colanode/ui/components/records/record-provider';
import { useBoardView } from '@colanode/ui/contexts/board-view';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordReorder } from '@colanode/ui/hooks/use-record-reorder';
import { useRecordsQuery } from '@colanode/ui/hooks/use-records-query';
import { positionForDrop } from '@colanode/ui/lib/record-position';

interface BoardViewColumnRecordsProps {
  columnId: string;
}

export const BoardViewColumnRecords = ({
  columnId,
}: BoardViewColumnRecordsProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();
  const boardView = useBoardView();

  const filters = useMemo(
    () => [...view.filters, boardView.filter],
    [view.filters, boardView.filter]
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRecordsQuery(filters, view.sorts);
  const records = data;
  const reorder = useRecordReorder();

  // Below the last card: the dropped card goes last in this column.
  const tailRef = useRef<HTMLDivElement | null>(null);
  const [{ isOverTail }, tailDrop] = useDrop({
    accept: 'board-record',
    canDrop: boardView.canDrop,
    drop: (item: { id: string } & Parameters<typeof boardView.drop>[0]) => ({
      value: boardView.drop(item),
      position: reorder.canReorder
        ? positionForDrop(records, item.id, null, 'after')
        : undefined,
    }),
    collect: (monitor) => ({
      isOverTail: monitor.isOver({ shallow: true }) && monitor.canDrop(),
    }),
  });

  return (
    <div className="flex flex-col">
      <BoardViewColumnSummary records={records} />
      <div className="mt-3 flex flex-col gap-2">
        {records.map((record) => {
          const role =
            extractNodeRole(record, workspace.userId) ?? database.role;

          return (
            <RecordProvider key={record.id} record={record} role={role}>
              <BoardViewRecordCard ordered={records} />
            </RecordProvider>
          );
        })}
        {boardView.canCreateInColumn !== false && (
          <BoardViewRecordCreateCard filters={filters} columnId={columnId} />
        )}
        <InView
          rootMargin="200px"
          onChange={(inView) => {
            if (inView && hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
        ></InView>
        <div
          ref={(node) => {
            tailRef.current = node;
            tailDrop(node);
          }}
          className="relative min-h-16"
          data-testid={`board-column-tail-${columnId}`}
        >
          <DropIndicator edge={isOverTail ? 'before' : null} axis="vertical" />
        </div>
      </div>
    </div>
  );
};
