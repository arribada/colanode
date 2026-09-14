// ABOUTME: Recursive renderer for the split view — branches become resizable
// ABOUTME: flex rows/columns, leaves mount their pane's router with a chrome bar.
import { RouterProvider } from '@tanstack/react-router';
import { Fragment, useCallback, useMemo, useRef, useState } from 'react';

import { SplitPaneControls } from '@colanode/ui/components/layouts/split/split-pane-controls';
import { SplitPaneContext } from '@colanode/ui/contexts/split-pane';
import { useSplitView } from '@colanode/ui/contexts/split-view';
import type {
  SplitBranch,
  SplitLeaf,
  SplitNode,
} from '@colanode/ui/lib/split-layout';
import { cn } from '@colanode/ui/lib/utils';

const SplitNodeView = ({ node }: { node: SplitNode }) => {
  if (node.type === 'leaf') {
    return <SplitPane leaf={node} />;
  }
  return <SplitBranchView branch={node} />;
};

const SplitBranchView = ({ branch }: { branch: SplitBranch }) => {
  const { resizePane } = useSplitView();
  const containerRef = useRef<HTMLDivElement>(null);
  const isRow = branch.direction === 'horizontal';

  const startResize = (index: number) => (event: React.PointerEvent) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const size = isRow ? rect.width : rect.height;
    if (size <= 0) {
      return;
    }
    let last = isRow ? event.clientX : event.clientY;
    const onMove = (moveEvent: PointerEvent) => {
      const current = isRow ? moveEvent.clientX : moveEvent.clientY;
      const delta = (current - last) / size;
      last = current;
      resizePane(branch.id, index, delta);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={containerRef}
      className={cn('flex h-full w-full', isRow ? 'flex-row' : 'flex-col')}
    >
      {branch.children.map((child, index) => (
        <Fragment key={child.id}>
          {index > 0 && (
            <div
              onPointerDown={startResize(index - 1)}
              className={cn(
                'shrink-0 bg-border transition-colors hover:bg-primary/40',
                isRow ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
              )}
            />
          )}
          <div
            className="min-h-0 min-w-0 overflow-hidden"
            style={{ flexGrow: branch.sizes[index] ?? 1, flexBasis: 0 }}
          >
            <SplitNodeView node={child} />
          </div>
        </Fragment>
      ))}
    </div>
  );
};

const SplitPane = ({ leaf }: { leaf: SplitLeaf }) => {
  const { getPaneRouter, focusedLeafId, focusPane, closePane, openInSplit } =
    useSplitView();
  const paneRouter = getPaneRouter(leaf.id);
  const focused = focusedLeafId === leaf.id;
  // Set as soon as a page header renders the controls for us. Until then the
  // pane floats its own copy, which is all a Container-less route ever gets.
  const [headerClaims, setHeaderClaims] = useState(0);

  const claimHeaderSlot = useCallback(() => {
    setHeaderClaims((n) => n + 1);
    return () => setHeaderClaims((n) => Math.max(0, n - 1));
  }, []);

  // Identity must be stable or every pane re-renders its whole router subtree
  // on each parent render. The location is read inside the handlers, never
  // captured at render time, so a stale href can never be split.
  const paneValue = useMemo(
    () => ({
      leafId: leaf.id,
      splitRight: () =>
        openInSplit(paneRouter.state.location.href, 'horizontal'),
      splitDown: () => openInSplit(paneRouter.state.location.href, 'vertical'),
      close: () => closePane(leaf.id),
      claimHeaderSlot,
    }),
    [leaf.id, openInSplit, closePane, paneRouter, claimHeaderSlot]
  );

  return (
    <SplitPaneContext.Provider value={paneValue}>
      <div
        onMouseDownCapture={() => focusPane(leaf.id)}
        className={cn(
          // `relative` is what lets a pane-scoped overlay anchor to the pane. It
          // does NOT capture `position: fixed` children — only transform/filter/
          // contain do that — so overlays that must follow their pane switch to
          // `absolute` via useSplitPane() rather than being trapped wholesale,
          // which would also have caged deliberately full-window surfaces.
          'group/pane relative flex h-full w-full flex-col',
          focused && 'ring-1 ring-inset ring-primary/40'
        )}
      >
        {headerClaims === 0 && (
          // Fallback only. A page header claims these as soon as one is on screen,
          // because floating them over the header covered its own buttons and made
          // them unclickable. What is left here is the case with no header at all.
          <div
            className={cn(
              'absolute right-1 top-1 z-30 flex items-center gap-0.5 rounded-md border bg-background/90 p-0.5 text-muted-foreground shadow-sm backdrop-blur transition-opacity',
              'opacity-0 focus-within:opacity-100 group-hover/pane:opacity-100',
              '[@media(hover:none)]:opacity-100'
            )}
          >
            <SplitPaneControls />
          </div>
        )}
        <div className="min-h-0 flex-1">
          <RouterProvider router={paneRouter} />
        </div>
      </div>
    </SplitPaneContext.Provider>
  );
};

export const SplitView = () => {
  const { tree } = useSplitView();
  if (!tree) {
    return null;
  }
  return (
    <div className="relative flex-1 overflow-hidden">
      <SplitNodeView node={tree} />
    </div>
  );
};
