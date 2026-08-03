import { createContext, useContext } from 'react';

// A most-recent-first stack of "inverse" callbacks. Each sidebar node operation
// (move, rename, delete) registers the inverse that reverts it, so a global
// Ctrl/Cmd-Z can pop and run the last one. The toast "Undo" button is the
// primary, discoverable path; this is the keyboard-shortcut fallback.
export interface NodeUndoContextValue {
  push: (undo: () => void) => void;
}

export const NodeUndoContext = createContext<NodeUndoContextValue>({
  push: () => {},
});

export const useNodeUndo = () => useContext(NodeUndoContext);
