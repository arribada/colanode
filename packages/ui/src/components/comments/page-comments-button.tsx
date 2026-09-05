import { eq, useLiveQuery } from '@tanstack/react-db';
import { MessageSquareText } from 'lucide-react';

import { LocalMessageNode } from '@colanode/client/types';
import { usePageComments } from '@colanode/ui/contexts/page-comments';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

interface PageCommentsButtonProps {
  pageId: string;
}

export const PageCommentsButton = ({ pageId }: PageCommentsButtonProps) => {
  const workspace = useWorkspace();
  const { commentsPageId, openComments, closeComments } = usePageComments();

  // Count only non-anchored messages: inline comment threads (anchorId set)
  // live in their own thread and are not shown in the page-level panel, so
  // they must not inflate the badge.
  const commentsQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'message'))
        .where(({ nodes }) => eq(nodes.parentId, pageId)),
    [workspace.userId, pageId]
  );

  const commentCount = commentsQuery.data.filter(
    (node) => !(node as LocalMessageNode).anchorId
  ).length;
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
