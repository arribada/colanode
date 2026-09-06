import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { X } from 'lucide-react';

import { ThreadPanelContent } from '@colanode/ui/components/messages/thread-panel-content';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@colanode/ui/components/ui/sheet';
import { useThreadPanel } from '@colanode/ui/contexts/thread-panel';

export const ThreadSheet = () => {
  const { threadRootId, closeThread } = useThreadPanel();

  return (
    <Sheet
      open={!!threadRootId}
      onOpenChange={(open) => {
        if (!open) {
          closeThread();
        }
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="flex h-[90vh] flex-col gap-0 rounded-t-3xl border-0 p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex h-10 shrink-0 flex-row items-center justify-between border-b border-border px-4">
          <SheetTitle className="text-sm font-semibold">Thread</SheetTitle>
          <button
            type="button"
            aria-label="Close thread"
            className="-mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={closeThread}
          >
            <X className="size-4" />
          </button>
        </div>
        <VisuallyHidden>
          <SheetDescription>Thread replies</SheetDescription>
        </VisuallyHidden>
        {threadRootId && (
          <div className="min-h-0 flex-1">
            <ThreadPanelContent threadRootId={threadRootId} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
