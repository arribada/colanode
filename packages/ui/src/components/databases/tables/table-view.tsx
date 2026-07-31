import { Fragment } from 'react';

import { ViewFilterButton } from '@colanode/ui/components/databases/search/view-filter-button';
import { ViewSearchBar } from '@colanode/ui/components/databases/search/view-search-bar';
import { ViewSortButton } from '@colanode/ui/components/databases/search/view-sort-button';
import { TableViewBody } from '@colanode/ui/components/databases/tables/table-view-body';
import { TableViewHeader } from '@colanode/ui/components/databases/tables/table-view-header';
import { TableViewRecordCreateRow } from '@colanode/ui/components/databases/tables/table-view-record-create-row';
import { TableViewSettings } from '@colanode/ui/components/databases/tables/table-view-settings';
import { ViewFullscreenButton } from '@colanode/ui/components/databases/view-fullscreen-button';
import { ViewTabs } from '@colanode/ui/components/databases/view-tabs';

export const TableView = () => {
  return (
    <Fragment>
      <div className="sticky top-0 left-0 z-30 flex w-full min-w-0 max-w-full flex-row justify-between border-b bg-background">
        <ViewTabs />
        <div className="invisible sticky right-0 flex shrink-0 flex-row items-center justify-end bg-background pl-2 group-hover/database:visible">
          <ViewFullscreenButton />
          <TableViewSettings />
          <ViewSortButton />
          <ViewFilterButton />
        </div>
      </div>
      <ViewSearchBar />
      <div className="mt-2 w-full min-w-full max-w-full overflow-auto pr-5">
        <TableViewHeader />
        <TableViewBody />
        <TableViewRecordCreateRow />
      </div>
    </Fragment>
  );
};
