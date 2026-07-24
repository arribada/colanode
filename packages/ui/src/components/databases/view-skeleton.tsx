import { Skeleton } from '@colanode/ui/components/ui/skeleton';

// Shown by View while the requested view layout's renderer (table/board/
// calendar/gallery/list -- each dynamic-imported on first use, see view.tsx)
// is still loading, so switching to a view a session hasn't opened yet shows
// a shaped placeholder instead of a blank flash.
export const ViewSkeleton = () => {
  return (
    <div className="flex h-full w-full flex-col gap-3 p-4">
      <div className="flex flex-row gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
};
