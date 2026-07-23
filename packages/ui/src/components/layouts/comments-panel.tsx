import { X } from 'lucide-react';
import { Resizable } from 're-resizable';

import { CommentsPanelContent } from '@colanode/ui/components/comments/comments-panel-content';
import { usePageComments } from '@colanode/ui/contexts/page-comments';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';

const DEFAULT_WIDTH = 400;

export const CommentsPanel = () => {
  const workspace = useWorkspace();
  const { commentsPageId, closeComments } = usePageComments();
  const [width, setWidth] = useMetadata<number>(
    workspace.userId,
    'comments-panel.width'
  );

  if (!commentsPageId) return null;

  return (
    <Resizable
      as="aside"
      size={{ width: width ?? DEFAULT_WIDTH, height: '100%' }}
      className="border-l border-border bg-background"
      minWidth={320}
      maxWidth={640}
      enable={{
        bottom: false,
        bottomLeft: false,
        bottomRight: false,
        left: true,
        right: false,
        top: false,
        topLeft: false,
        topRight: false,
      }}
      onResize={(_, __, ref) => setWidth(ref.offsetWidth)}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-10 shrink-0 flex-row items-center justify-between border-b border-border px-3">
          <p className="text-sm font-semibold">Comments</p>
          <button
            type="button"
            aria-label="Close comments"
            className="cursor-pointer text-muted-foreground hover:text-foreground"
            onClick={closeComments}
          >
            <X className="size-4" />
          </button>
        </div>
        <CommentsPanelContent pageId={commentsPageId} />
      </div>
    </Resizable>
  );
};
