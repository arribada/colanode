import { useMemo } from 'react';
import { InView } from 'react-intersection-observer';

import { extractNodeRole } from '@colanode/core';
import { BoardViewColumnSummary } from '@colanode/ui/components/databases/boards/board-view-column-summary';
import { BoardViewRecordCard } from '@colanode/ui/components/databases/boards/board-view-record-card';
import { BoardViewRecordCreateCard } from '@colanode/ui/components/databases/boards/board-view-record-create-card';
import { RecordProvider } from '@colanode/ui/components/records/record-provider';
import { useBoardView } from '@colanode/ui/contexts/board-view';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordsQuery } from '@colanode/ui/hooks/use-records-query';

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

  return (
    <div className="flex flex-col">
      <BoardViewColumnSummary records={records} />
      <div className="mt-3 flex flex-col gap-2">
        {records.map((record) => {
          const role =
            extractNodeRole(record, workspace.userId) ?? database.role;

          return (
            <RecordProvider key={record.id} record={record} role={role}>
              <BoardViewRecordCard />
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
      </div>
    </div>
  );
};
