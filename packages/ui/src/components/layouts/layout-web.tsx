// ABOUTME: Web shell — one browser-history router that stays mounted, with the
// ABOUTME: split living inside the workspace render area rather than over it.
import {
  createBrowserHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

import { SplitViewProvider } from '@colanode/ui/components/layouts/split/split-view-provider';
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
  // from the active tab; the web shell has no tabs, so without this the provider
  // would fall back to '/' and the left pane would lose the page being read.
  const resolveCurrentLocation = useCallback(
    () => router.state.location.href,
    [router]
  );

  // Panes navigate their own memory routers, so nothing touches the address bar
  // while a split is open. When the split ends, the surviving pane's location
  // has to be pushed back here, otherwise this router is still sitting on the
  // pre-split URL and every navigation made inside the panes is thrown away.
  const handleExitSplit = useCallback(
    (location: string) => {
      void router.navigate({ href: location, replace: true });
    },
    [router]
  );

  return (
    <SplitViewProvider
      resolveCurrentLocation={resolveCurrentLocation}
      onExitSplit={handleExitSplit}
    >
      <RouterProvider router={router} />
    </SplitViewProvider>
  );
};
