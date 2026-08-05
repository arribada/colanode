import { ChevronDown } from 'lucide-react';

import { ViewCreateButton } from '@colanode/ui/components/databases/view-create-button';
import { ViewIcon } from '@colanode/ui/components/databases/view-icon';
import { ViewTab } from '@colanode/ui/components/databases/view-tab';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseViews } from '@colanode/ui/contexts/database-views';
import { cn } from '@colanode/ui/lib/utils';

// Above this many views the inline tabs get cramped, so they collapse into a
// single dropdown showing the active view (Notion-style).
const INLINE_TABS_LIMIT = 3;

export const ViewTabs = () => {
  const database = useDatabase();
  const databaseViews = useDatabaseViews();
  const views = databaseViews.views;

  const canCreate = database.canEdit && !database.isLocked;

  if (views.length > INLINE_TABS_LIMIT) {
    const activeView =
      views.find((view) => view.id === databaseViews.activeViewId) ?? views[0];

    return (
      <div className="flex flex-row items-center gap-2 py-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex cursor-pointer flex-row items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-accent"
            >
              {activeView && (
                <ViewIcon
                  id={activeView.id}
                  name={activeView.name}
                  avatar={activeView.avatar}
                  layout={activeView.layout}
                  className="size-4"
                />
              )}
              <span className="font-medium">{activeView?.name ?? 'Views'}</span>
              <span className="text-xs text-muted-foreground">
                {views.length}
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-52">
            {views.map((view) => (
              <DropdownMenuItem
                key={view.id}
                onClick={() => databaseViews.onActiveViewChange(view.id)}
                className={cn(
                  'flex cursor-pointer flex-row items-center gap-2',
                  view.id === activeView?.id && 'bg-accent'
                )}
              >
                <ViewIcon
                  id={view.id}
                  name={view.name}
                  avatar={view.avatar}
                  layout={view.layout}
                  className="size-4"
                />
                <span className="flex-1 truncate">{view.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {canCreate && <ViewCreateButton />}
      </div>
    );
  }

  return (
    <div className="flex flex-row items-center gap-3">
      {views.map((view) => (
        <ViewTab
          key={view.id}
          view={view}
          isActive={view.id === databaseViews.activeViewId}
          onClick={() => databaseViews.onActiveViewChange(view.id)}
        />
      ))}
      {canCreate && <ViewCreateButton />}
    </div>
  );
};
