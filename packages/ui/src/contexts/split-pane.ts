// ABOUTME: Marks a subtree as living inside a split pane, so the workspace
// ABOUTME: chrome is rendered once around the split instead of once per pane.
import { createContext, useContext } from 'react';

export interface SplitPaneContextProps {
  // Id of the split leaf this subtree is rendered in.
  leafId: string;
}

// null = not inside a pane. Every consumer must treat null as "normal view", so
// the unsplit app, the desktop shell and the public share page are untouched.
export const SplitPaneContext = createContext<SplitPaneContextProps | null>(
  null
);

export const useSplitPane = () => useContext(SplitPaneContext);
