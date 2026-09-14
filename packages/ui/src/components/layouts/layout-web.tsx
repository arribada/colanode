// ABOUTME: Web shell — a single browser-history router for normal browsing,
// ABOUTME: wrapped in the split view so panes can be opened side by side.
import {
  createBrowserHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { useCallback, useMemo, type ReactNode } from 'react';

import { SplitView } from '@colanode/ui/components/layouts/split/split-view';
import { SplitViewProvider } from '@colanode/ui/components/layouts/split/split-view-provider';
import { useSplitView } from '@colanode/ui/contexts/split-view';
import { routeTree } from '@colanode/ui/routes';
import { routeMasks } from '@colanode/ui/routes/masks';

export const LayoutWeb = () => {
  const router = useMemo(() => {
    return createRouter({
      routeTree,
      routeMasks: routeMasks,
      context: {},
      history: createBrowserHistory(),
      defaultPreload: 'intent',
      scrollRestoration: true,
      defaultStructuralSharing: true,
      defaultPreloadStaleTime: 0,
    });
  }, []);

  // The first split keeps whatever is on screen on one side. Desktop reads that
  // from the active tab; the web shell has no tabs, so without this the
  // provider would fall back to '/' and the left pane would lose the page the
  // user was actually reading.
  const resolveCurrentLocation = useCallback(
    () => router.state.location.href,
    [router]
  );

  return (
    <SplitViewProvider resolveCurrentLocation={resolveCurrentLocation}>
      <SplitOrBrowserRouter>
        <RouterProvider router={router} />
      </SplitOrBrowserRouter>
    </SplitViewProvider>
  );
};

// Split panes own their own memory routers, so the browser router is unmounted
// while a split is open and remounted — with its history intact, because the
// router object itself is memoized — as soon as the last pane is closed. The
// two are mutually exclusive, exactly as on desktop, so the same route is never
// mounted twice at once.
const SplitOrBrowserRouter = ({ children }: { children: ReactNode }) => {
  const { tree } = useSplitView();
  return tree ? <SplitView /> : <>{children}</>;
};
