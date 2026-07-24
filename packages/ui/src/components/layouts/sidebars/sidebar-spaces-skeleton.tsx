import { Skeleton } from '@colanode/ui/components/ui/skeleton';

// Shown by SidebarSpaces while the local spaces query is still hydrating
// (e.g. a fresh device on its first, potentially multi-minute, workspace
// sync), so the sidebar shows a shaped placeholder instead of an empty
// gap before the tree pops in.
export const SidebarSpacesSkeleton = () => {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3 pt-1">
      {[0, 1, 2].map((groupIndex) => (
        <div key={groupIndex} className="flex flex-col gap-1">
          <div className="flex items-center gap-2 rounded-sm px-1 py-1.5">
            <Skeleton className="size-5 shrink-0 rounded-sm" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <div className="flex flex-col gap-1.5 py-0.5 pl-7">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
};
