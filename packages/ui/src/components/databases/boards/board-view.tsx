import { Fragment } from 'react';

import { BoardViewColumns } from '@colanode/ui/components/databases/boards/board-view-columns';
import { BoardViewNoGroup } from '@colanode/ui/components/databases/boards/board-view-no-group';
import { ViewFilterButton } from '@colanode/ui/components/databases/search/view-filter-button';
import { ViewSearchBar } from '@colanode/ui/components/databases/search/view-search-bar';
import { ViewSortButton } from '@colanode/ui/components/databases/search/view-sort-button';
import { ViewFullscreenButton } from '@colanode/ui/components/databases/view-fullscreen-button';
import { ViewSettingsPopover } from '@colanode/ui/components/databases/view-settings-popover';
import { ViewTabs } from '@colanode/ui/components/databases/view-tabs';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

export const BoardView = () => {
  const database = useDatabase();
  const view = useDatabaseView();

  const groupByField = database.fields.find(
    (field) => field.id === view.groupBy
  );

  return (
    <Fragment>
      <div className="sticky top-0 left-0 z-30 flex w-full min-w-0 max-w-full flex-row justify-between border-b bg-background">
        <ViewTabs />
        <div className="sticky right-0 flex shrink-0 flex-row items-center justify-end bg-background pl-2">
          <div className="invisible flex flex-row items-center group-hover/database:visible">
            <ViewFullscreenButton />
            <ViewSettingsPopover />
          </div>
          <ViewSortButton />
          <ViewFilterButton />
        </div>
      </div>
      <ViewSearchBar />
      <div className="mt-2 flex w-full min-w-full max-w-full flex-row gap-2 overflow-auto pr-5">
        {groupByField ? (
          <BoardViewColumns field={groupByField} />
        ) : (
          <BoardViewNoGroup />
        )}
      </div>
    </Fragment>
  );
};
