// ABOUTME: Stateful provider for the split view — owns the local split tree and
// ABOUTME: a lazily-built memory router per pane. Nothing here is persisted.
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import { collections } from '@colanode/ui/collections';
import { SplitViewContext } from '@colanode/ui/contexts/split-view';
import { useIsMobile } from '@colanode/ui/hooks/use-is-mobile';
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

interface SplitViewProviderProps {
  children: ReactNode;
  // Where the first split starts from. Desktop derives it from the active
  // tab; the web shell has no tabs and passes its browser router's current
  // location instead, so the left pane keeps the page being read.
  resolveCurrentLocation?: () => string;
  // Called when the last real split ends, with the surviving pane's current
  // location. Panes navigate memory routers, so the host router is still on
  // the pre-split URL; without this every in-pane navigation is discarded.
  onExitSplit?: (location: string) => void;
}

export const SplitViewProvider = ({
  children,
  resolveCurrentLocation,
  onExitSplit,
}: SplitViewProviderProps) => {
  const isMobile = useIsMobile();
  const [tree, setTree] = useState<SplitNode | null>(null);
  const [focusedLeafId, setFocusedLeafId] = useState<string | null>(null);

  // Mirrors of render-time values so closePane can compute outside a setState
  // updater: React may run an updater twice or discard it, and the ref
  // bookkeeping plus the exit callback must happen exactly once.
  const treeRef = useRef<SplitNode | null>(null);
  treeRef.current = tree;
  const onExitSplitRef = useRef(onExitSplit);
  onExitSplitRef.current = onExitSplit;

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
          const first = singleLeaf(
            resolveCurrentLocation?.() ?? activeTabLocation(),
            nextPaneId
          );
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
    [focusedLeafId, registerLocations, resolveCurrentLocation]
  );

  const closePane = useCallback((leafId: string) => {
    const current = treeRef.current;
    if (!current) {
      return;
    }

    const next = closePaneOp(current, leafId);
    routersRef.current.delete(leafId);
    locationsRef.current.delete(leafId);

    // A one-pane "split" is not a split. The pure tree op correctly collapses
    // a two-leaf tree to the surviving leaf (two tests pin that), but the
    // provider used to treat any non-null tree as "still split": the survivor
    // kept its chrome and its focus ring, so Close looked broken and had to be
    // clicked twice. The policy belongs here, not in the tree primitive.
    const leaves = next ? collectLeaves(next) : [];
    if (!next || leaves.length === 1) {
      const survivor = leaves[0];
      // The survivor's CURRENT location, not the seed it was created with:
      // locationsRef would send the user back to where that pane started
      // rather than where they actually navigated to.
      const location = survivor
        ? (routersRef.current.get(survivor.id)?.state.location.href ??
          locationsRef.current.get(survivor.id))
        : undefined;

      routersRef.current.clear();
      locationsRef.current.clear();
      setFocusedLeafId(null);
      // Hand the location back BEFORE the tree flips: the host router renders
      // again in the same commit, so pushing first lands on the right page in
      // one paint instead of flashing the stale pre-split location.
      if (location) {
        onExitSplitRef.current?.(location);
      }
      setTree(null);
      return;
    }

    setFocusedLeafId((prev) =>
      prev && leaves.some((l) => l.id === prev)
        ? prev
        : (leaves[0]?.id ?? null)
    );
    setTree(next);
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
        // Two panes inside a phone-width window are unusable, and the mobile
        // shell has no room for the pane controls either.
        isSplitAvailable: !isMobile,
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
