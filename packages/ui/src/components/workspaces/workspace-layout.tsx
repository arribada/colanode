import { Outlet, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AiChatPanel } from '@colanode/ui/components/layouts/ai-chat-panel';
import { AiChatToggle } from '@colanode/ui/components/layouts/ai-chat-toggle';
import { CommentsPanel } from '@colanode/ui/components/layouts/comments-panel';
import { CommentsSheet } from '@colanode/ui/components/layouts/comments-sheet';
import { SidebarDesktop } from '@colanode/ui/components/layouts/sidebars/sidebar-desktop';
import { SplitView } from '@colanode/ui/components/layouts/split/split-view';
import { SuggestionsPanel } from '@colanode/ui/components/layouts/suggestions-panel';
import { ThreadPanel } from '@colanode/ui/components/layouts/thread-panel';
import { ThreadSheet } from '@colanode/ui/components/layouts/thread-sheet';
import { SearchDialog } from '@colanode/ui/components/search/search-dialog';
import { WorkspaceSyncIndicator } from '@colanode/ui/components/workspaces/workspace-sync-indicator';
import { AiChatPanelContext } from '@colanode/ui/contexts/ai-chat-panel';
import { useApp } from '@colanode/ui/contexts/app';
import { NodeUndoContext } from '@colanode/ui/contexts/node-undo';
import { PageCommentsContext } from '@colanode/ui/contexts/page-comments';
import { PageSuggestionsContext } from '@colanode/ui/contexts/page-suggestions';
import { SearchContext } from '@colanode/ui/contexts/search';
import { useSplitPane } from '@colanode/ui/contexts/split-pane';
import { useSplitView } from '@colanode/ui/contexts/split-view';
import { ThreadPanelContext } from '@colanode/ui/contexts/thread-panel';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useIsMobile } from '@colanode/ui/hooks/use-is-mobile';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';

// A split pane mounts the whole route tree, so it reaches this component again.
// Rendering the chrome there is what produced two icon rails, two sidebars, one
// Cmd/Ctrl-K listener per pane (so one keypress opened N stacked search
// dialogs), one Ctrl-Z undo stack per pane, and N floating AI/sync buttons piled
// on the same viewport pixel. Inside a pane we render the content and nothing
// else: the chrome is already on screen once, wrapped around the split itself,
// and its contexts reach the pane because RouterProvider is a plain context
// provider, so the React tree is continuous across it.
export const WorkspaceLayout = () => {
  const pane = useSplitPane();

  if (pane) {
    return <Outlet />;
  }

  return <WorkspaceChrome />;
};

const WorkspaceChrome = () => {
  const app = useApp();
  const isMobile = useIsMobile();
  const workspace = useWorkspace();
  const splitView = useSplitView();
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
  const [suggestionsPageId, setSuggestionsPageId] = useState<string | null>(
    null
  );
  const [composeBlockId, setComposeBlockId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Only the web shell hosts the split inside its render area. On desktop the
  // split is swapped in above the tabs by layout-desktop, and TabsContent mounts
  // every tab router at once, so hosting it here as well would mount the same
  // pane router from several RouterProviders simultaneously, which TanStack does
  // not support.
  const splitActive = app.type === 'web' && splitView.tree !== null;

  // Track the current suggestions target so the route-change reset effect below
  // can tell whether a navigation is *arriving at* the page a suggestion
  // notification just opened (keep the panel) versus leaving it (reset).
  const suggestionsPageIdRef = useRef<string | null>(null);
  suggestionsPageIdRef.current = suggestionsPageId;

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
    // A suggestion notification navigates to its target page and opens the
    // panel in the same click; that navigation would otherwise fire this reset
    // and immediately close it. Keep the panel whenever the newly-active route
    // targets the page it points at; only reset when navigating elsewhere.
    const suggestionsTarget = suggestionsPageIdRef.current;
    if (!suggestionsTarget || !location.split('/').includes(suggestionsTarget)) {
      setSuggestionsPageId(null);
      setComposeBlockId(null);
    }
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

  // thread, comments and suggestions panels are mutually exclusive side surfaces
  const openThread = useCallback((id: string) => {
    setCommentsPageId(null);
    setCommentsAnchorId(null);
    setSuggestionsPageId(null);
    setComposeBlockId(null);
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
      setSuggestionsPageId(null);
      setComposeBlockId(null);
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

  // Open the suggestions panel in review mode (list) or compose mode (a block).
  const openSuggestions = useCallback((pageId: string) => {
    setThreadRootId(null);
    setCommentsPageId(null);
    setCommentsAnchorId(null);
    setComposeBlockId(null);
    setSuggestionsPageId(pageId);
  }, []);
  const openSuggest = useCallback((pageId: string, blockId: string) => {
    setThreadRootId(null);
    setCommentsPageId(null);
    setCommentsAnchorId(null);
    setSuggestionsPageId(pageId);
    setComposeBlockId(blockId);
  }, []);
  const closeSuggestions = useCallback(() => {
    setSuggestionsPageId(null);
    setComposeBlockId(null);
  }, []);
  const suggestionsValue = useMemo(
    () => ({
      suggestionsPageId,
      composeBlockId,
      openSuggestions,
      openSuggest,
      closeSuggestions,
    }),
    [
      suggestionsPageId,
      composeBlockId,
      openSuggestions,
      openSuggest,
      closeSuggestions,
    ]
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
              <PageSuggestionsContext.Provider value={suggestionsValue}>
                <div className="w-full h-full flex">
                  {!isMobile && <SidebarDesktop />}
                  <section className="min-w-0 flex-1">
                    {splitActive ? (
                      // SplitView's root is `flex-1`; it needs a height-bounded
                      // flex column or the panes collapse to their content
                      // height and fill only the top of the window.
                      <div className="flex h-full flex-col">
                        <SplitView />
                      </div>
                    ) : (
                      <Outlet />
                    )}
                  </section>
                  {!isMobile && <ThreadPanel />}
                  {!isMobile && <CommentsPanel />}
                  <SuggestionsPanel />
                  {!isMobile && <AiChatPanel />}
                  {isMobile && <ThreadSheet />}
                  {isMobile && <CommentsSheet />}
                </div>
                {!isMobile && <AiChatToggle />}
                <SearchDialog />
                <WorkspaceSyncIndicator />
              </PageSuggestionsContext.Provider>
            </PageCommentsContext.Provider>
          </ThreadPanelContext.Provider>
        </SearchContext.Provider>
      </AiChatPanelContext.Provider>
    </NodeUndoContext.Provider>
  );
};
