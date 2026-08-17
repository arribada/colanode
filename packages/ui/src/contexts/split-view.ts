// ABOUTME: React context for the local-only multi-pane split view — exposes the
// ABOUTME: current split tree and the operations the UI triggers on it.
import { createContext, useContext } from 'react';

import type { SplitDirection, SplitNode } from '@colanode/ui/lib/split-layout';
import { router } from '@colanode/ui/routes';


export interface SplitViewContextProps {
  // null = not split: the normal single-tab content is shown instead.
  tree: SplitNode | null;
  focusedLeafId: string | null;
  // Open `location` in a new pane split off the focused pane (or, when nothing
  // is split yet, alongside the current view).
  openInSplit: (location: string, direction: SplitDirection) => void;
  closePane: (leafId: string) => void;
  resizePane: (branchId: string, index: number, delta: number) => void;
  focusPane: (leafId: string) => void;
  // A memory-history router for a pane, created lazily and cached by leaf id.
  getPaneRouter: (leafId: string) => typeof router;
}

export const SplitViewContext = createContext<SplitViewContextProps>(
  {} as SplitViewContextProps
);

export const useSplitView = () => useContext(SplitViewContext);
