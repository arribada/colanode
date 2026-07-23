import { count, eq, useLiveQuery } from '@tanstack/react-db';
import { MessageSquareText } from 'lucide-react';

import { usePageComments } from '@colanode/ui/contexts/page-comments';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

interface PageCommentsButtonProps {
  pageId: string;
}

export const PageCommentsButton = ({ pageId }: PageCommentsButtonProps) => {
  const workspace = useWorkspace();
  const { commentsPageId, openComments, closeComments } = usePageComments();

  const commentCountQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'message'))
        .where(({ nodes }) => eq(nodes.parentId, pageId))
        .select(({ nodes }) => ({
          count: count(nodes.id),
        }))
        .findOne(),
    [workspace.userId, pageId]
  );

  const commentCount = commentCountQuery.data?.count ?? 0;
  const isOpen = commentsPageId === pageId;

  return (
    <button
      type="button"
      aria-label={isOpen ? 'Close comments' : 'Open comments'}
      data-testid={`page-comments-button-${pageId}`}
      className={cn(
        'flex cursor-pointer flex-row items-center gap-1 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground',
        isOpen && 'text-foreground'
      )}
      onClick={() => {
        if (isOpen) {
          closeComments();
        } else {
          openComments(pageId);
        }
      }}
    >
      <MessageSquareText className="size-4" />
      {commentCount > 0 && (
        <span className="text-xs tabular-nums">{commentCount}</span>
      )}
    </button>
  );
};
