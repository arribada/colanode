// ABOUTME: Top-level chart view layout — header (tabs + settings + sort/filter)
// ABOUTME: over an aggregated pie/bar/line chart of the filtered records.
import { Fragment } from 'react';

import { ChartViewBody } from '@colanode/ui/components/databases/charts/chart-view-body';
import { ChartViewSettings } from '@colanode/ui/components/databases/charts/chart-view-settings';
import { ViewFilterButton } from '@colanode/ui/components/databases/search/view-filter-button';
import { ViewSearchBar } from '@colanode/ui/components/databases/search/view-search-bar';
import { ViewSortButton } from '@colanode/ui/components/databases/search/view-sort-button';
import { ViewFullscreenButton } from '@colanode/ui/components/databases/view-fullscreen-button';
import { ViewTabs } from '@colanode/ui/components/databases/view-tabs';

export const ChartView = () => {
  return (
    <Fragment>
      <div className="sticky top-0 left-0 z-30 flex w-full min-w-0 max-w-full flex-row justify-between border-b bg-background">
        <ViewTabs />
        <div className="invisible sticky right-0 flex shrink-0 flex-row items-center justify-end bg-background pl-2 group-hover/database:visible">
          <ViewFullscreenButton />
          <ChartViewSettings />
          <ViewSortButton />
          <ViewFilterButton />
        </div>
      </div>
      <ViewSearchBar />
      <div className="mt-2 w-full min-w-full max-w-full overflow-auto pr-5">
        <ChartViewBody />
      </div>
    </Fragment>
  );
};
