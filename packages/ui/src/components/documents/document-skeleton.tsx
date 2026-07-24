import { Skeleton } from '@colanode/ui/components/ui/skeleton';

// Shown by Document while the TipTap editor chunk (document-editor.tsx,
// which pulls in the full extensions/commands/menus stack) is being
// dynamically imported, so opening a page/record shows a document-shaped
// placeholder instead of a blank flash before the editor mounts. Deliberately
// has no header row of its own -- PageContainer/RecordContainer already
// render their own chrome above this, so this only covers the content area.
export const DocumentSkeleton = () => {
  return (
    <div className="flex flex-col gap-4 px-4 pt-6 lg:px-10">
      <Skeleton className="h-8 w-2/3" />
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
};
