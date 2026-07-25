import { count, eq, useLiveQuery } from '@tanstack/react-db';
import { useRef } from 'react';

import { extractNodeRole } from '@colanode/core';
import { Conversation } from '@colanode/ui/components/messages/conversation';
import {
  ScrollArea,
  ScrollViewport,
} from '@colanode/ui/components/ui/scroll-area';
import { ContainerContext } from '@colanode/ui/contexts/container';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface CommentsPanelContentProps {
  pageId: string;
  // When set, scope the panel to a single inline comment thread.
  anchorId?: string | null;
}

// Notion-style page comments: message nodes parented directly to the page.
// Reuses the chat Conversation (list + composer + reactions + quote replies);
// replies fall back to quote-reply because thread panels are channel-only.
export const CommentsPanelContent = ({
  pageId,
  anchorId,
}: CommentsPanelContentProps) => {
  const workspace = useWorkspace();
  const scrollAreaRef = useRef<HTMLDivElement>(null!);
  const scrollViewportRef = useRef<HTMLDivElement>(null!);

  const pageQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, pageId))
        .findOne(),
    [workspace.userId, pageId]
  );
  const page = pageQuery.data;

  const rootNodeQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, page?.rootId ?? ''))
        .findOne(),
    [workspace.userId, page?.rootId]
  );
  const rootNode = rootNodeQuery.data;

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

  const role = rootNode ? extractNodeRole(rootNode, workspace.userId) : null;

  if (!page || page.type !== 'page' || !role) {
    return <p className="p-4 text-sm text-muted-foreground">Page not found.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {anchorId ? (
        <p className="shrink-0 px-4 pt-3 text-sm text-muted-foreground">
          Comment on the highlighted text.
        </p>
      ) : (
        commentCount === 0 && (
          <p className="shrink-0 px-4 pt-3 text-sm text-muted-foreground">
            No comments yet. Start the discussion below.
          </p>
        )
      )}
      <div className="min-h-0 flex-1">
        <ContainerContext.Provider
          value={{ type: 'modal', scrollAreaRef, scrollViewportRef }}
        >
          <ScrollArea ref={scrollAreaRef} className="h-full overflow-hidden">
            <ScrollViewport ref={scrollViewportRef} className="h-full">
              <div className="h-full px-4">
                <Conversation
                  conversationId={page.id}
                  rootId={page.rootId}
                  role={role}
                  anchorId={anchorId}
                />
              </div>
            </ScrollViewport>
          </ScrollArea>
        </ContainerContext.Provider>
      </div>
    </div>
  );
};
