// ABOUTME: The timeline (Gantt) layout -- a deliberately plain schedule view:
// ABOUTME: bars on a date axis, no dependencies, no critical path, no levelling.

import { Fragment } from 'react';

import { ViewFilterButton } from '@colanode/ui/components/databases/search/view-filter-button';
import { ViewSearchBar } from '@colanode/ui/components/databases/search/view-search-bar';
import { ViewSortButton } from '@colanode/ui/components/databases/search/view-sort-button';
import { TimelineConfigSettings } from '@colanode/ui/components/databases/timelines/timeline-config-settings';
import { TimelineViewChart } from '@colanode/ui/components/databases/timelines/timeline-view-chart';
import { TimelineViewNoConfig } from '@colanode/ui/components/databases/timelines/timeline-view-no-config';
import { ViewFullscreenButton } from '@colanode/ui/components/databases/view-fullscreen-button';
import { ViewSettingsPopover } from '@colanode/ui/components/databases/view-settings-popover';
import { ViewTabs } from '@colanode/ui/components/databases/view-tabs';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

export const TimelineView = () => {
  const view = useDatabaseView();
  const configured = Boolean(view.timeline?.startFieldId);

  return (
    <Fragment>
      <div className="sticky top-0 left-0 z-30 flex w-full min-w-0 max-w-full flex-row justify-between border-b bg-background">
        <ViewTabs />
        <div className="sticky right-0 flex shrink-0 flex-row items-center justify-end bg-background pl-2">
          <div className="invisible flex flex-row items-center group-hover/database:visible">
            <ViewFullscreenButton />
            <ViewSettingsPopover showConditionalColor={false}>
              <TimelineConfigSettings />
            </ViewSettingsPopover>
          </div>
          <ViewSortButton />
          <ViewFilterButton />
        </div>
      </div>
      <ViewSearchBar />
      {configured ? <TimelineViewChart /> : <TimelineViewNoConfig />}
    </Fragment>
  );
};
