import { eq, useLiveQuery } from '@tanstack/react-db';
import { useEffect, useRef } from 'react';

import { extractNodeRole } from '@colanode/core';
import { Conversation } from '@colanode/ui/components/messages/conversation';
import { Message } from '@colanode/ui/components/messages/message';
import { ScrollArea, ScrollViewport } from '@colanode/ui/components/ui/scroll-area';
import { ContainerContext } from '@colanode/ui/contexts/container';
import { ConversationContext } from '@colanode/ui/contexts/conversation';
import { useRadar } from '@colanode/ui/contexts/radar';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface ThreadPanelContentProps {
  threadRootId: string;
}

export const ThreadPanelContent = ({ threadRootId }: ThreadPanelContentProps) => {
  const workspace = useWorkspace();
  const radar = useRadar();
  const scrollAreaRef = useRef<HTMLDivElement>(null!);
  const scrollViewportRef = useRef<HTMLDivElement>(null!);

  const rootMessageQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, threadRootId))
        .findOne(),
    [workspace.userId, threadRootId]
  );
  const root = rootMessageQuery.data;

  const rootNodeQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, root?.rootId ?? ''))
        .findOne(),
    [workspace.userId, root?.rootId]
  );
  const rootNode = rootNodeQuery.data;

  const role = rootNode ? extractNodeRole(rootNode, workspace.userId) : null;

  // Mark the thread root as seen when the panel opens or the thread changes,
  // so the workspace unread badge clears immediately (mirrors message.tsx InView pattern).
  useEffect(() => {
    radar.markNodeAsSeen(workspace.userId, threadRootId);
  }, [workspace.userId, threadRootId]);

  if (!root || root.type !== 'message' || !role) {
    return <p className="p-4 text-sm text-muted-foreground">Message not found.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* fixed header: root message in a minimal conversation provider */}
      <div className="shrink-0 border-b border-border px-4 py-2">
        <ConversationContext.Provider
          value={{
            id: root.parentId ?? root.rootId,
            role,
            rootId: root.rootId,
            canCreateMessage: false,
            isThread: true,
            onReply: () => {},
            onQuoteReply: () => {},
            onOpenThread: () => {},
            onLastMessageIdChange: () => {},
            canDeleteMessage: () => false,
          }}
        >
          <Message message={root} />
        </ConversationContext.Provider>
      </div>
      {/* thread conversation fills the rest; composer pins to bottom */}
      <div className="min-h-0 flex-1">
        <ContainerContext.Provider
          value={{ type: 'modal', scrollAreaRef, scrollViewportRef }}
        >
          <ScrollArea ref={scrollAreaRef} className="h-full overflow-hidden">
            <ScrollViewport ref={scrollViewportRef} className="h-full">
              <div className="h-full px-4">
                <Conversation
                  conversationId={threadRootId}
                  rootId={root.rootId}
                  role={role}
                  isThread
                />
              </div>
            </ScrollViewport>
          </ScrollArea>
        </ContainerContext.Provider>
      </div>
    </div>
  );
};
