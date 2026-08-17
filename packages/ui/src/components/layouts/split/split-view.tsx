// ABOUTME: Recursive renderer for the split view — branches become resizable
// ABOUTME: flex rows/columns, leaves mount their pane's router with a chrome bar.
import { RouterProvider } from '@tanstack/react-router';
import { Columns2, Rows2, X } from 'lucide-react';
import { Fragment, useRef } from 'react';

import { useSplitView } from '@colanode/ui/contexts/split-view';
import type { SplitBranch, SplitLeaf, SplitNode } from '@colanode/ui/lib/split-layout';
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

  return (
    <div
      onMouseDownCapture={() => focusPane(leaf.id)}
      className={cn(
        'flex h-full w-full flex-col',
        focused && 'ring-1 ring-inset ring-primary/40'
      )}
    >
      <div className="flex h-6 shrink-0 items-center justify-end gap-0.5 border-b bg-muted/40 px-1 text-muted-foreground">
        <button
          type="button"
          title="Split right"
          onClick={() => openInSplit(leaf.tabId, 'horizontal')}
          className="flex size-5 items-center justify-center rounded hover:bg-accent hover:text-foreground"
        >
          <Columns2 className="size-3.5" />
        </button>
        <button
          type="button"
          title="Split down"
          onClick={() => openInSplit(leaf.tabId, 'vertical')}
          className="flex size-5 items-center justify-center rounded hover:bg-accent hover:text-foreground"
        >
          <Rows2 className="size-3.5" />
        </button>
        <button
          type="button"
          title="Close pane"
          onClick={() => closePane(leaf.id)}
          className="flex size-5 items-center justify-center rounded hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <RouterProvider router={paneRouter} />
      </div>
    </div>
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
