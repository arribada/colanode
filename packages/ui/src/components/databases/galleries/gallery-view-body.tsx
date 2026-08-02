import { InView } from 'react-intersection-observer';

import { extractNodeRole } from '@colanode/core';
import { EmptyDatabaseState } from '@colanode/ui/components/databases/empty-database-state';
import { GalleryViewCard } from '@colanode/ui/components/databases/galleries/gallery-view-card';
import { GalleryViewRecordCreateCard } from '@colanode/ui/components/databases/galleries/gallery-view-record-create-card';
import { RecordProvider } from '@colanode/ui/components/records/record-provider';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordsQuery } from '@colanode/ui/hooks/use-records-query';

export const GalleryViewBody = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRecordsQuery(view.filters, view.sorts);

  const records = data;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 pb-2">
      {records.length === 0 && (
        <EmptyDatabaseState className="col-span-full" />
      )}
      {records.map((record) => {
        const role = extractNodeRole(record, workspace.userId) ?? database.role;

        return (
          <RecordProvider key={record.id} record={record} role={role}>
            <GalleryViewCard />
          </RecordProvider>
        );
      })}
      <GalleryViewRecordCreateCard />
      <InView
        className="col-span-full"
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
