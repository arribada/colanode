import { Skeleton } from '@colanode/ui/components/ui/skeleton';

// Shown by TableViewBody while the first page of records is still loading,
// so opening a table view shows shaped placeholder rows instead of an
// empty flash before records pop in.
export const TableViewSkeleton = () => {
  return (
    <div className="flex flex-col">
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="flex h-8 flex-row items-center gap-3 border-b px-2"
        >
          <Skeleton className="h-3.5 w-4 shrink-0 rounded-sm" />
          <Skeleton className="h-3.5 w-40 shrink-0" />
          <Skeleton className="h-3.5 w-24 shrink-0" />
          <Skeleton className="h-3.5 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
};
