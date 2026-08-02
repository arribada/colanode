import { InView } from 'react-intersection-observer';

import { extractNodeRole } from '@colanode/core';
import { EmptyDatabaseState } from '@colanode/ui/components/databases/empty-database-state';
import { ListViewRecordCreateRow } from '@colanode/ui/components/databases/lists/list-view-record-create-row';
import { ListViewRow } from '@colanode/ui/components/databases/lists/list-view-row';
import { RecordProvider } from '@colanode/ui/components/records/record-provider';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordsQuery } from '@colanode/ui/hooks/use-records-query';

export const ListViewBody = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRecordsQuery(view.filters, view.sorts);

  const records = data;

  return (
    <div className="flex flex-col">
      {records.length === 0 && <EmptyDatabaseState className="border-b" />}
      {records.map((record) => {
        const role = extractNodeRole(record, workspace.userId) ?? database.role;

        return (
          <RecordProvider key={record.id} record={record} role={role}>
            <ListViewRow />
          </RecordProvider>
        );
      })}
      <ListViewRecordCreateRow />
      <InView
        rootMargin="200px"
        onChange={(inView) => {
          if (inView && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
      ></InView>
    </div>
  );
};
