import { InView } from 'react-intersection-observer';

import { extractNodeRole } from '@colanode/core';
import { EmptyDatabaseState } from '@colanode/ui/components/databases/empty-database-state';
import { ViewFilterButton } from '@colanode/ui/components/databases/search/view-filter-button';
import { ViewSearchBar } from '@colanode/ui/components/databases/search/view-search-bar';
import { ViewSortButton } from '@colanode/ui/components/databases/search/view-sort-button';
import { TableViewMobileCard } from '@colanode/ui/components/databases/tables/table-view-mobile-card';
import { TableViewMobileCreateCard } from '@colanode/ui/components/databases/tables/table-view-mobile-create-card';
import { ViewTabs } from '@colanode/ui/components/databases/view-tabs';
import { RecordProvider } from '@colanode/ui/components/records/record-provider';
import { Skeleton } from '@colanode/ui/components/ui/skeleton';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordsQuery } from '@colanode/ui/hooks/use-records-query';

// Mobile rendering of a `table` layout. The desktop grid scrolls
// horizontally which is painful on a phone, so here each record is a
// self-contained card that stacks its name + visible field values
// vertically -- no lateral scrolling. Wired exactly like the list /
// gallery bodies (same records query + infinite scroll + record
// provider), only the per-record presentation differs.
export const TableViewMobile = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRecordsQuery(view.filters, view.sorts);

  const records = data;

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 left-0 z-30 flex w-full min-w-0 max-w-full flex-row justify-between border-b bg-background">
        <ViewTabs />
        <div className="sticky right-0 flex shrink-0 flex-row items-center justify-end bg-background pl-2">
          <ViewSortButton />
          <ViewFilterButton />
        </div>
      </div>
      <ViewSearchBar />
      <div className="mt-2 flex w-full flex-col gap-2 pb-4">
        {isLoading && records.length === 0
          ? [0, 1, 2, 3].map((card) => (
              <Skeleton key={card} className="h-24 w-full rounded-lg" />
            ))
          : null}
        {!isLoading && records.length === 0 && (
          <EmptyDatabaseState className="rounded-lg border" />
        )}
        {records.map((record) => {
          const role =
            extractNodeRole(record, workspace.userId) ?? database.role;

          return (
            <RecordProvider key={record.id} record={record} role={role}>
              <TableViewMobileCard />
            </RecordProvider>
          );
        })}
        <TableViewMobileCreateCard />
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
