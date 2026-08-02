// ABOUTME: Top-level chart view layout — header (tabs + settings + sort/filter)
// ABOUTME: over an aggregated pie/bar/line chart of the filtered records.
import { Fragment } from 'react';

import { ChartConfigSettings } from '@colanode/ui/components/databases/charts/chart-config-settings';
import { ChartViewBody } from '@colanode/ui/components/databases/charts/chart-view-body';
import { ViewFilterButton } from '@colanode/ui/components/databases/search/view-filter-button';
import { ViewSearchBar } from '@colanode/ui/components/databases/search/view-search-bar';
import { ViewSortButton } from '@colanode/ui/components/databases/search/view-sort-button';
import { ViewFullscreenButton } from '@colanode/ui/components/databases/view-fullscreen-button';
import { ViewSettingsPopover } from '@colanode/ui/components/databases/view-settings-popover';
import { ViewTabs } from '@colanode/ui/components/databases/view-tabs';

export const ChartView = () => {
  return (
    <Fragment>
      <div className="sticky top-0 left-0 z-30 flex w-full min-w-0 max-w-full flex-row justify-between border-b bg-background">
        <ViewTabs />
        <div className="sticky right-0 flex shrink-0 flex-row items-center justify-end bg-background pl-2">
          <div className="invisible flex flex-row items-center group-hover/database:visible">
            <ViewFullscreenButton />
            <ViewSettingsPopover
              showFieldSettings={false}
              showConditionalColor={false}
              showCsvActions={false}
            >
              <ChartConfigSettings />
            </ViewSettingsPopover>
          </div>
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
