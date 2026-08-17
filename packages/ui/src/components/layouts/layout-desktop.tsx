import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { useCallback, useRef } from 'react';

import { Tab } from '@colanode/client/types';
import {
  compareString,
  generateFractionalIndex,
  generateId,
  IdType,
} from '@colanode/core';
import { collections } from '@colanode/ui/collections';
import { SplitView } from '@colanode/ui/components/layouts/split/split-view';
import { SplitViewProvider } from '@colanode/ui/components/layouts/split/split-view-provider';
import { TabsContent } from '@colanode/ui/components/layouts/tabs/tabs-content';
import { TabsHeader } from '@colanode/ui/components/layouts/tabs/tabs-header';
import { useSplitView } from '@colanode/ui/contexts/split-view';
import { TabManagerContext } from '@colanode/ui/contexts/tab-manager';
import { router, routeTree } from '@colanode/ui/routes';

export const LayoutDesktop = () => {
  const routersRef = useRef<Map<string, typeof router>>(new Map());

  const handleTabAdd = useCallback((location: string) => {
    const tabs = collections.tabs.map((tab) => tab);
    const orderedTabs = tabs.toSorted((a, b) =>
      compareString(a.index, b.index)
    );

    const lastIndex = orderedTabs[orderedTabs.length - 1]?.index;
    const tab: Tab = {
      id: generateId(IdType.Tab),
      location,
      index: generateFractionalIndex(lastIndex, null),
      lastActiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    collections.tabs.insert(tab);
  }, []);

  const handleTabDelete = useCallback((id: string) => {
    const tabs = collections.tabs.map((tab) => tab);
    if (tabs.length === 1) {
      return;
    }

    collections.tabs.delete(id);
  }, []);

  const handleTabSwitch = useCallback((id: string) => {
    collections.tabs.update(id, (tab) => {
      tab.lastActiveAt = new Date().toISOString();
    });
  }, []);

  const handleTabGetRouter = useCallback((id: string) => {
    if (routersRef.current.has(id)) {
      return routersRef.current.get(id)!;
    }

    const tab = collections.tabs.get(id);
    if (!tab) {
      throw new Error(`Tab ${id} not found`);
    }

    const router = createRouter({
      routeTree,
      context: {},
      history: createMemoryHistory({
        initialEntries: [tab.location ?? '/'],
      }),
      defaultPreload: 'intent',
      scrollRestoration: true,
      defaultPreloadStaleTime: 0,
    });

    router.subscribe('onRendered', (event) => {
      if (!event.hrefChanged) {
        return;
      }

      const location = event.toLocation.href;
      window.colanode.executeMutation({
        type: 'tab.update',
        id,
        location,
      });
    });

    routersRef.current.set(id, router);
    return router;
  }, []);

  return (
    <TabManagerContext.Provider
      value={{
        addTab: handleTabAdd,
        deleteTab: handleTabDelete,
        switchTab: handleTabSwitch,
        getRouter: handleTabGetRouter,
      }}
    >
      <SplitViewProvider>
        <div className="flex flex-col h-full">
          <TabsHeader />
          <LayoutBody />
        </div>
      </SplitViewProvider>
    </TabManagerContext.Provider>
  );
};

// Show the split view when a split is active; otherwise the normal tabbed
// content. The two are mutually exclusive so a pane router and a tab router for
// the same route are never mounted at the same time.
const LayoutBody = () => {
  const { tree } = useSplitView();
  return tree ? <SplitView /> : <TabsContent />;
};
