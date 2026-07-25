import { Outlet, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CommentsPanel } from '@colanode/ui/components/layouts/comments-panel';
import { CommentsSheet } from '@colanode/ui/components/layouts/comments-sheet';
import { SidebarDesktop } from '@colanode/ui/components/layouts/sidebars/sidebar-desktop';
import { ThreadPanel } from '@colanode/ui/components/layouts/thread-panel';
import { ThreadSheet } from '@colanode/ui/components/layouts/thread-sheet';
import { SearchDialog } from '@colanode/ui/components/search/search-dialog';
import { WorkspaceSyncIndicator } from '@colanode/ui/components/workspaces/workspace-sync-indicator';
import { PageCommentsContext } from '@colanode/ui/contexts/page-comments';
import { SearchContext } from '@colanode/ui/contexts/search';
import { ThreadPanelContext } from '@colanode/ui/contexts/thread-panel';
import { useIsMobile } from '@colanode/ui/hooks/use-is-mobile';

export const WorkspaceLayout = () => {
  const isMobile = useIsMobile();
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [commentsPageId, setCommentsPageId] = useState<string | null>(null);
  const [commentsAnchorId, setCommentsAnchorId] = useState<string | null>(
    null
  );
  const [searchOpen, setSearchOpen] = useState(false);

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

  return (
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
            {isMobile && <ThreadSheet />}
            {isMobile && <CommentsSheet />}
          </div>
          <SearchDialog />
          <WorkspaceSyncIndicator />
        </PageCommentsContext.Provider>
      </ThreadPanelContext.Provider>
    </SearchContext.Provider>
  );
};
