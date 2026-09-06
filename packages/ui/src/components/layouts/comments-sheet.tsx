import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { X } from 'lucide-react';

import { CommentsPanelContent } from '@colanode/ui/components/comments/comments-panel-content';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@colanode/ui/components/ui/sheet';
import { usePageComments } from '@colanode/ui/contexts/page-comments';

export const CommentsSheet = () => {
  const { commentsPageId, commentsAnchorId, closeComments } =
    usePageComments();

  return (
    <Sheet
      open={!!commentsPageId}
      onOpenChange={(open) => {
        if (!open) {
          closeComments();
        }
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="flex h-[90vh] flex-col gap-0 rounded-t-3xl border-0 p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex h-10 shrink-0 flex-row items-center justify-between border-b border-border px-4">
          <SheetTitle className="text-sm font-semibold">
            {commentsAnchorId ? 'Comment' : 'Comments'}
          </SheetTitle>
          <button
            type="button"
            aria-label="Close comments"
            className="-mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={closeComments}
          >
            <X className="size-4" />
          </button>
        </div>
        <VisuallyHidden>
          <SheetDescription>Page comments</SheetDescription>
        </VisuallyHidden>
        {commentsPageId && (
          <div className="min-h-0 flex-1">
            <CommentsPanelContent
              pageId={commentsPageId}
              anchorId={commentsAnchorId}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
