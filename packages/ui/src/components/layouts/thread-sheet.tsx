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
        className="flex h-[90vh] flex-col gap-0 rounded-t-3xl border-0 p-0"
      >
        <div className="flex h-10 shrink-0 flex-row items-center justify-between border-b border-border px-4">
          <SheetTitle className="text-sm font-semibold">Thread</SheetTitle>
          <button
            type="button"
            aria-label="Close thread"
            className="cursor-pointer text-muted-foreground hover:text-foreground"
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
