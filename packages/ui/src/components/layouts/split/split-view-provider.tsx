// ABOUTME: Stateful provider for the split view — owns the local split tree and
// ABOUTME: a lazily-built memory router per pane. Nothing here is persisted.
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import { collections } from '@colanode/ui/collections';
import { SplitViewContext } from '@colanode/ui/contexts/split-view';
import {
  closePane as closePaneOp,
  collectLeaves,
  resizeBranch,
  singleLeaf,
  splitPane,
  type SplitDirection,
  type SplitNode,
} from '@colanode/ui/lib/split-layout';
import { router, routeTree } from '@colanode/ui/routes';

// The location the current single-tab view is showing, so the first split keeps
// what you were looking at on one side.
const activeTabLocation = (): string => {
  const tabs = collections.tabs.map((tab) => tab);
  const active = tabs.toSorted((a, b) =>
    b.lastActiveAt.localeCompare(a.lastActiveAt)
  )[0];
  return active?.location ?? '/';
};

// Pane ids are process-local and monotonic; a module counter keeps them unique
// without pulling in id generation (and without Math.random, which is banned in
// some of our tooling anyway).
let paneSeq = 0;
const nextPaneId = (): string => `pane-${++paneSeq}`;

export const SplitViewProvider = ({ children }: { children: ReactNode }) => {
  const [tree, setTree] = useState<SplitNode | null>(null);
  const [focusedLeafId, setFocusedLeafId] = useState<string | null>(null);

  const routersRef = useRef<Map<string, typeof router>>(new Map());
  // leaf id -> the initial location its router was seeded with.
  const locationsRef = useRef<Map<string, string>>(new Map());

  const getPaneRouter = useCallback((leafId: string): typeof router => {
    const existing = routersRef.current.get(leafId);
    if (existing) {
      return existing;
    }
    const location = locationsRef.current.get(leafId) ?? '/';
    const paneRouter = createRouter({
      routeTree,
      context: {},
      history: createMemoryHistory({ initialEntries: [location] }),
      defaultPreload: 'intent',
      scrollRestoration: true,
      defaultPreloadStaleTime: 0,
    });
    routersRef.current.set(leafId, paneRouter);
    return paneRouter;
  }, []);

  const registerLocations = useCallback((node: SplitNode) => {
    for (const leaf of collectLeaves(node)) {
      if (!locationsRef.current.has(leaf.id)) {
        // leaf.tabId carries the pane's location (the split-tree core treats it
        // as an opaque string handle).
        locationsRef.current.set(leaf.id, leaf.tabId);
      }
    }
  }, []);

  const openInSplit = useCallback(
    (location: string, direction: SplitDirection) => {
      setTree((current) => {
        if (!current) {
          const first = singleLeaf(activeTabLocation(), nextPaneId);
          const built = splitPane(
            first,
            first.id,
            location,
            direction,
            nextPaneId
          );
          registerLocations(built);
          const added = collectLeaves(built).find(
            (leaf) => leaf.id !== first.id
          );
          setFocusedLeafId(added?.id ?? first.id);
          return built;
        }

        const target =
          (focusedLeafId && collectLeaves(current).some((l) => l.id === focusedLeafId)
            ? focusedLeafId
            : collectLeaves(current)[0]?.id) ?? null;
        if (!target) {
          return current;
        }
        const known = new Set(collectLeaves(current).map((l) => l.id));
        const built = splitPane(
          current,
          target,
          location,
          direction,
          nextPaneId
        );
        registerLocations(built);
        const added = collectLeaves(built).find((leaf) => !known.has(leaf.id));
        setFocusedLeafId(added?.id ?? target);
        return built;
      });
    },
    [focusedLeafId, registerLocations]
  );

  const closePane = useCallback((leafId: string) => {
    setTree((current) => {
      if (!current) {
        return current;
      }
      const next = closePaneOp(current, leafId);
      routersRef.current.delete(leafId);
      locationsRef.current.delete(leafId);
      if (!next) {
        // Last pane closed: leave split mode and hand control back to the tabs.
        routersRef.current.clear();
        locationsRef.current.clear();
        setFocusedLeafId(null);
        return null;
      }
      setFocusedLeafId((prev) => {
        if (prev && collectLeaves(next).some((l) => l.id === prev)) {
          return prev;
        }
        return collectLeaves(next)[0]?.id ?? null;
      });
      return next;
    });
  }, []);

  const resizePane = useCallback(
    (branchId: string, index: number, delta: number) => {
      setTree((current) =>
        current ? resizeBranch(current, branchId, index, delta) : current
      );
    },
    []
  );

  const focusPane = useCallback((leafId: string) => {
    setFocusedLeafId(leafId);
  }, []);

  return (
    <SplitViewContext.Provider
      value={{
        tree,
        focusedLeafId,
        openInSplit,
        closePane,
        resizePane,
        focusPane,
        getPaneRouter,
      }}
    >
      {children}
    </SplitViewContext.Provider>
  );
};
