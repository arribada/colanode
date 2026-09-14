// ABOUTME: The three per-pane controls (split right, split down, close), shared
// ABOUTME: by the page header slot and by the pane's fallback overlay.
import { Columns2, Rows2, X } from 'lucide-react';
import { useEffect } from 'react';

import { useSplitPane } from '@colanode/ui/contexts/split-pane';

const buttonClass =
  'flex cursor-pointer flex-row items-center gap-1 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground';

export const SplitPaneControls = () => {
  const pane = useSplitPane();

  if (!pane) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Split right"
        title="Split right"
        className={buttonClass}
        onClick={pane.splitRight}
      >
        <Columns2 className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Split down"
        title="Split down"
        className={buttonClass}
        onClick={pane.splitDown}
      >
        <Rows2 className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Close pane"
        title="Close pane"
        className={buttonClass}
        onClick={pane.close}
      >
        <X className="size-4" />
      </button>
    </>
  );
};

// Rendered by Container at the end of its actions row. Claiming the slot tells
// the pane it no longer needs its floating fallback, which only exists for
// routes that render no Container at all (a node error, a not-found) and would
// otherwise leave a pane with no way to close it.
export const SplitPaneHeaderControls = () => {
  const pane = useSplitPane();
  const claim = pane?.claimHeaderSlot;

  useEffect(() => {
    if (!claim) {
      return;
    }
    return claim();
  }, [claim]);

  if (!pane) {
    return null;
  }

  return (
    <div className="ml-1 flex items-center gap-0.5 border-l border-border pl-1">
      <SplitPaneControls />
    </div>
  );
};
