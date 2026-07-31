import { ArrowDownAz } from 'lucide-react';

import { ViewSortAddPopover } from '@colanode/ui/components/databases/search/view-sort-add-popover';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

export const ViewSortButton = () => {
  const view = useDatabaseView();

  if (view.sorts.length > 0) {
    return (
      <button
        type="button"
        className="flex cursor-pointer items-center rounded-md p-1.5 hover:bg-accent"
        onClick={() => view.openSearchBar()}
        aria-label="Sort"
        data-testid="view-sort-button"
      >
        <ArrowDownAz className="size-4" />
      </button>
    );
  }

  return (
    <ViewSortAddPopover>
      <button
        type="button"
        className="flex cursor-pointer items-center rounded-md p-1.5 hover:bg-accent"
        aria-label="Sort"
        data-testid="view-sort-button"
      >
        <ArrowDownAz className="size-4" />
      </button>
    </ViewSortAddPopover>
  );
};
