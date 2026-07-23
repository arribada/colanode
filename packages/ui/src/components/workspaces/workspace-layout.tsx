import { Outlet, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CommentsPanel } from '@colanode/ui/components/layouts/comments-panel';
import { CommentsSheet } from '@colanode/ui/components/layouts/comments-sheet';
import { SidebarDesktop } from '@colanode/ui/components/layouts/sidebars/sidebar-desktop';
import { ThreadPanel } from '@colanode/ui/components/layouts/thread-panel';
import { ThreadSheet } from '@colanode/ui/components/layouts/thread-sheet';
import { PageCommentsContext } from '@colanode/ui/contexts/page-comments';
import { ThreadPanelContext } from '@colanode/ui/contexts/thread-panel';
import { useIsMobile } from '@colanode/ui/hooks/use-is-mobile';

export const WorkspaceLayout = () => {
  const isMobile = useIsMobile();
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [commentsPageId, setCommentsPageId] = useState<string | null>(null);

  // close the panels whenever the active route changes (stale-panel guard)
  const location = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    setThreadRootId(null);
    setCommentsPageId(null);
  }, [location]);

  // thread and comments panels are mutually exclusive side surfaces
  const openThread = useCallback((id: string) => {
    setCommentsPageId(null);
    setThreadRootId(id);
  }, []);
  const closeThread = useCallback(() => setThreadRootId(null), []);
  const threadValue = useMemo(
    () => ({ threadRootId, openThread, closeThread }),
    [threadRootId, openThread, closeThread]
  );

  const openComments = useCallback((pageId: string) => {
    setThreadRootId(null);
    setCommentsPageId(pageId);
  }, []);
  const closeComments = useCallback(() => setCommentsPageId(null), []);
  const commentsValue = useMemo(
    () => ({ commentsPageId, openComments, closeComments }),
    [commentsPageId, openComments, closeComments]
  );

  return (
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
      </PageCommentsContext.Provider>
    </ThreadPanelContext.Provider>
  );
};
