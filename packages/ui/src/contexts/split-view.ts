// ABOUTME: React context for the local-only multi-pane split view — exposes the
// ABOUTME: current split tree and the operations the UI triggers on it.
import { createContext, useContext } from 'react';

import type { SplitDirection, SplitNode } from '@colanode/ui/lib/split-layout';
import { router } from '@colanode/ui/routes';


export interface SplitViewContextProps {
  // Whether a real split-view provider is mounted (desktop only). The default
  // context has this false so the shared sidebar affordances that trigger a
  // split can hide themselves on web/mobile where openInSplit is a no-op.
  isSplitAvailable: boolean;
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
