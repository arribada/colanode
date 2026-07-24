import { InView } from 'react-intersection-observer';

import { TableViewEmptyPlaceholder } from '@colanode/ui/components/databases/tables/table-view-empty-placeholder';
import { TableViewRow } from '@colanode/ui/components/databases/tables/table-view-row';
import { TableViewSkeleton } from '@colanode/ui/components/databases/tables/table-view-skeleton';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useRecordsQuery } from '@colanode/ui/hooks/use-records-query';

export const TableViewBody = () => {
  const view = useDatabaseView();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRecordsQuery(view.filters, view.sorts);

  const records = data;

  if (isLoading && records.length === 0) {
    return (
      <div className="border-t">
        <TableViewSkeleton />
      </div>
    );
  }

  return (
    <div className="border-t">
      {records.length === 0 && <TableViewEmptyPlaceholder />}
      {records.map((record, index) => (
        <TableViewRow key={record.id} index={index} record={record} />
      ))}
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
