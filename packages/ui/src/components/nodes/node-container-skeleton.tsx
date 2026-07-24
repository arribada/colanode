import { Skeleton } from '@colanode/ui/components/ui/skeleton';

// Shown by NodeProvider while the requested node (and its ancestor chain,
// needed to resolve the breadcrumb/role) is still loading, so opening a
// page/database/channel/... shows a shaped placeholder matching Container's
// own header + content layout instead of a blank flash before content
// pops in.
export const NodeContainerSkeleton = () => {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 w-full shrink-0 items-center gap-2 p-3">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 pt-6 lg:px-10">
        <Skeleton className="h-8 w-2/3" />
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
};
