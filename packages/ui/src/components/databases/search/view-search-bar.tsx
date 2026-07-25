import { Fragment } from 'react';

import { ViewFilters } from '@colanode/ui/components/databases/search/view-filters';
import { ViewSorts } from '@colanode/ui/components/databases/search/view-sorts';
import { Separator } from '@colanode/ui/components/ui/separator';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { cn } from '@colanode/ui/lib/utils';

export const ViewSearchBar = () => {
  const view = useDatabaseView();

  if (!view.isSearchBarOpened) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-row items-center gap-2">
      <div className="flex flex-row items-center rounded-md border border-dashed p-0.5 text-xs">
        {(['shared', 'personal'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => view.setScopeMode(m)}
            className={cn(
              'rounded px-2 py-0.5 capitalize text-muted-foreground',
              view.scopeMode === m && 'bg-accent text-foreground font-medium'
            )}
          >
            {m}
          </button>
        ))}
      </div>
      {view.scopeMode === 'personal' && (
        <button
          type="button"
          onClick={view.clearPersonal}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Reset to shared
        </button>
      )}
      <Separator orientation="vertical" className="mx-1 h-4" />
      {view.sorts.length > 0 && (
        <Fragment>
          <ViewSorts />
          <Separator orientation="vertical" className="mx-1 h-4" />
        </Fragment>
      )}
      <ViewFilters />
    </div>
  );
};
