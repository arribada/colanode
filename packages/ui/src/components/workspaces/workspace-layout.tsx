import { Outlet, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SidebarDesktop } from '@colanode/ui/components/layouts/sidebars/sidebar-desktop';
import { ThreadPanel } from '@colanode/ui/components/layouts/thread-panel';
import { ThreadSheet } from '@colanode/ui/components/layouts/thread-sheet';
import { SearchDialog } from '@colanode/ui/components/search/search-dialog';
import { SearchContext } from '@colanode/ui/contexts/search';
import { ThreadPanelContext } from '@colanode/ui/contexts/thread-panel';
import { useIsMobile } from '@colanode/ui/hooks/use-is-mobile';

export const WorkspaceLayout = () => {
  const isMobile = useIsMobile();
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // close the panel whenever the active route changes (stale-panel guard)
  const location = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    setThreadRootId(null);
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

  const openThread = useCallback((id: string) => setThreadRootId(id), []);
  const closeThread = useCallback(() => setThreadRootId(null), []);
  const value = useMemo(
    () => ({ threadRootId, openThread, closeThread }),
    [threadRootId, openThread, closeThread]
  );

  const searchValue = useMemo(
    () => ({ open: searchOpen, setOpen: setSearchOpen }),
    [searchOpen]
  );

  return (
    <SearchContext.Provider value={searchValue}>
      <ThreadPanelContext.Provider value={value}>
        <div className="w-full h-full flex">
          {!isMobile && <SidebarDesktop />}
          <section className="min-w-0 flex-1">
            <Outlet />
          </section>
          {!isMobile && <ThreadPanel />}
          {isMobile && <ThreadSheet />}
        </div>
        <SearchDialog />
      </ThreadPanelContext.Provider>
    </SearchContext.Provider>
  );
};
