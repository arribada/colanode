import { Outlet, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AiChatPanel } from '@colanode/ui/components/layouts/ai-chat-panel';
import { AiChatToggle } from '@colanode/ui/components/layouts/ai-chat-toggle';
import { CommentsPanel } from '@colanode/ui/components/layouts/comments-panel';
import { CommentsSheet } from '@colanode/ui/components/layouts/comments-sheet';
import { SidebarDesktop } from '@colanode/ui/components/layouts/sidebars/sidebar-desktop';
import { ThreadPanel } from '@colanode/ui/components/layouts/thread-panel';
import { ThreadSheet } from '@colanode/ui/components/layouts/thread-sheet';
import { SearchDialog } from '@colanode/ui/components/search/search-dialog';
import { WorkspaceSyncIndicator } from '@colanode/ui/components/workspaces/workspace-sync-indicator';
import { AiChatPanelContext } from '@colanode/ui/contexts/ai-chat-panel';
import { NodeUndoContext } from '@colanode/ui/contexts/node-undo';
import { PageCommentsContext } from '@colanode/ui/contexts/page-comments';
import { SearchContext } from '@colanode/ui/contexts/search';
import { ThreadPanelContext } from '@colanode/ui/contexts/thread-panel';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useIsMobile } from '@colanode/ui/hooks/use-is-mobile';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';

export const WorkspaceLayout = () => {
  const isMobile = useIsMobile();
  const workspace = useWorkspace();
  const [aiOpen, setAiOpen] = useMetadata<boolean>(
    workspace.userId,
    'ai.chat.open'
  );
  const isAiOpen = aiOpen ?? false;
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [commentsPageId, setCommentsPageId] = useState<string | null>(null);
  const [commentsAnchorId, setCommentsAnchorId] = useState<string | null>(
    null
  );
  const [searchOpen, setSearchOpen] = useState(false);

  // Most-recent-first inverses of sidebar node operations, for global Ctrl/Cmd-Z.
  const undoStackRef = useRef<Array<() => void>>([]);
  const pushUndo = useCallback((undo: () => void) => {
    const stack = undoStackRef.current;
    stack.push(undo);
    // Bound the history so a long session can't grow it without limit.
    if (stack.length > 25) {
      stack.shift();
    }
  }, []);
  const nodeUndoValue = useMemo(() => ({ push: pushUndo }), [pushUndo]);

  // close the panels whenever the active route changes (stale-panel guard)
  const location = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    setThreadRootId(null);
    setCommentsPageId(null);
    setCommentsAnchorId(null);
  }, [location]);

  // Cmd-K (macOS) / Ctrl-K toggles the workspace-wide search dialog
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((previous) => !previous);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Ctrl/Cmd-Z reverts the most recent sidebar node operation (move, rename,
  // delete). It steps aside for any surface that owns its own undo history:
  // form fields, the document editor (ProseMirror) and the whiteboard canvas.
  // The board registers its own global Ctrl-Z while it is mounted, so whenever a
  // board is on screen (its overlay layer is in the DOM) we let it win.
  useEffect(() => {
    const ownsUndo = (): boolean => {
      if (document.querySelector('.board-overlay')) {
        return true;
      }
      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (!active) {
        return false;
      }
      return (
        active.isContentEditable ||
        active.closest(
          'input, textarea, [contenteditable="true"], .ProseMirror'
        ) !== null
      );
    };

    const handleUndo = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.shiftKey ||
        event.key.toLowerCase() !== 'z'
      ) {
        return;
      }
      if (ownsUndo()) {
        return;
      }
      const undo = undoStackRef.current.pop();
      if (!undo) {
        return;
      }
      event.preventDefault();
      undo();
    };

    window.addEventListener('keydown', handleUndo);
    return () => window.removeEventListener('keydown', handleUndo);
  }, []);

  // thread and comments panels are mutually exclusive side surfaces
  const openThread = useCallback((id: string) => {
    setCommentsPageId(null);
    setCommentsAnchorId(null);
    setThreadRootId(id);
  }, []);
  const closeThread = useCallback(() => setThreadRootId(null), []);
  const threadValue = useMemo(
    () => ({ threadRootId, openThread, closeThread }),
    [threadRootId, openThread, closeThread]
  );

  const openComments = useCallback(
    (pageId: string, anchorId?: string | null) => {
      setThreadRootId(null);
      setCommentsPageId(pageId);
      setCommentsAnchorId(anchorId ?? null);
    },
    []
  );
  const closeComments = useCallback(() => {
    setCommentsPageId(null);
    setCommentsAnchorId(null);
  }, []);
  const commentsValue = useMemo(
    () => ({ commentsPageId, commentsAnchorId, openComments, closeComments }),
    [commentsPageId, commentsAnchorId, openComments, closeComments]
  );

  const searchValue = useMemo(
    () => ({ open: searchOpen, setOpen: setSearchOpen }),
    [searchOpen]
  );

  const aiPanelValue = useMemo(
    () => ({
      isOpen: isAiOpen,
      openPanel: () => setAiOpen(true),
      closePanel: () => setAiOpen(false),
      togglePanel: () => setAiOpen(!isAiOpen),
    }),
    [isAiOpen, setAiOpen]
  );

  return (
    <NodeUndoContext.Provider value={nodeUndoValue}>
      <AiChatPanelContext.Provider value={aiPanelValue}>
        <SearchContext.Provider value={searchValue}>
          <ThreadPanelContext.Provider value={threadValue}>
            <PageCommentsContext.Provider value={commentsValue}>
              <div className="w-full h-full flex">
                {!isMobile && <SidebarDesktop />}
                <section className="min-w-0 flex-1">
                  <Outlet />
                </section>
                {!isMobile && <ThreadPanel />}
                {!isMobile && <CommentsPanel />}
                {!isMobile && <AiChatPanel />}
                {isMobile && <ThreadSheet />}
                {isMobile && <CommentsSheet />}
              </div>
              {!isMobile && <AiChatToggle />}
              <SearchDialog />
              <WorkspaceSyncIndicator />
            </PageCommentsContext.Provider>
          </ThreadPanelContext.Provider>
        </SearchContext.Provider>
      </AiChatPanelContext.Provider>
    </NodeUndoContext.Provider>
  );
};
