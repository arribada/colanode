// ABOUTME: Marks a subtree as living inside a split pane, so the workspace
// ABOUTME: chrome is rendered once around the split instead of once per pane.
import { createContext, useContext } from 'react';

export interface SplitPaneContextProps {
  // Id of the split leaf this subtree is rendered in.
  leafId: string;
  splitRight: () => void;
  splitDown: () => void;
  close: () => void;
  // The page header claims the controls while it is mounted, so the pane stops
  // floating its own copy over them. Floating them on top of the header meant
  // the buttons underneath — version, settings — could not be clicked at all.
  // Returns the release function.
  claimHeaderSlot: () => () => void;
}

// null = not inside a pane. Every consumer must treat null as "normal view", so
// the unsplit app, the desktop shell and the public share page are untouched.
export const SplitPaneContext = createContext<SplitPaneContextProps | null>(
  null
);

export const useSplitPane = () => useContext(SplitPaneContext);
