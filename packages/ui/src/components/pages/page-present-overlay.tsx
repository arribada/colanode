// ABOUTME: A full-screen presentation of a page — its blocks cut into slides,
// ABOUTME: either at the headings or by how much fits on a screen.
import { ChevronLeft, ChevronRight, Rows3, ScrollText, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { mapBlocksToContents } from '@colanode/client/lib';
import { DocumentState, DocumentUpdate } from '@colanode/client/types';
import { RichTextContent } from '@colanode/core';
import { YDoc } from '@colanode/crdt';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { NodeRenderer } from '@colanode/ui/editor/renderers/node';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { buildSlides, type SlideMode } from '@colanode/ui/lib/present-slides';
import { cn } from '@colanode/ui/lib/utils';

const MODE_KEY = 'colanode.present-mode';

const buildYDoc = (
  state: DocumentState | null | undefined,
  updates: DocumentUpdate[]
) => {
  const ydoc = new YDoc(state?.state);
  for (const update of updates) {
    ydoc.applyUpdate(update.data);
  }
  return ydoc;
};

const readMode = (): SlideMode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'size' ? 'size' : 'section';
  } catch {
    return 'section';
  }
};

interface PagePresentOverlayProps {
  pageId: string;
  name: string;
  onClose: () => void;
}

export const PagePresentOverlay = ({
  pageId,
  name,
  onClose,
}: PagePresentOverlayProps) => {
  const workspace = useWorkspace();
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<SlideMode>(readMode);

  const stateQuery = useLiveQuery({
    type: 'document.state.get',
    documentId: pageId,
    userId: workspace.userId,
  });
  const updatesQuery = useLiveQuery({
    type: 'document.updates.list',
    documentId: pageId,
    userId: workspace.userId,
  });

  const content = useMemo<RichTextContent | null>(() => {
    if (stateQuery.isPending || updatesQuery.isPending) {
      return null;
    }
    const ydoc = buildYDoc(stateQuery.data, updatesQuery.data ?? []);
    return ydoc.getObject<RichTextContent>();
  }, [
    stateQuery.isPending,
    stateQuery.data,
    updatesQuery.isPending,
    updatesQuery.data,
  ]);

  const slides = useMemo(() => {
    if (!content) {
      return [];
    }
    const nodes = mapBlocksToContents(pageId, Object.values(content.blocks));
    return buildSlides(nodes, mode);
  }, [content, pageId, mode]);

  const count = slides.length;
  const current = Math.min(index, Math.max(0, count - 1));
  const slide = slides[current];

  const go = useCallback(
    (delta: number) =>
      setIndex((value) =>
        Math.min(Math.max(value + delta, 0), Math.max(0, count - 1))
      ),
    [count]
  );

  // Changing how the page is cut keeps you at the start rather than somewhere
  // arbitrary in a different set of slides.
  const changeMode = (next: SlideMode) => {
    setMode(next);
    setIndex(0);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // A browser that refuses local storage simply forgets the choice.
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          event.preventDefault();
          go(1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          go(-1);
          break;
        case 'Home':
          setIndex(0);
          break;
        case 'End':
          setIndex(Math.max(0, count - 1));
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go, count]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
        <span className="min-w-0 truncate text-sm font-medium text-muted-foreground">
          {name}
          {slide?.title && (
            <span className="text-foreground">
              {' · '}
              {slide.title}
              {slide.continued && (
                <span className="text-muted-foreground"> (continued)</span>
              )}
            </span>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <div className="mr-2 flex items-center rounded-md border border-border p-0.5">
            <button
              type="button"
              title="One slide per section"
              aria-pressed={mode === 'section'}
              onClick={() => changeMode('section')}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent',
                mode === 'section' && 'bg-accent text-foreground'
              )}
            >
              <Rows3 className="size-3.5" />
              Sections
            </button>
            <button
              type="button"
              title="Fill each slide by content size"
              aria-pressed={mode === 'size'}
              onClick={() => changeMode('size')}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent',
                mode === 'size' && 'bg-accent text-foreground'
              )}
            >
              <ScrollText className="size-3.5" />
              Even
            </button>
          </div>
          <button
            type="button"
            aria-label="Previous slide"
            disabled={current === 0}
            onClick={() => go(-1)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="w-16 text-center text-xs tabular-nums text-muted-foreground">
            {count === 0 ? '0 / 0' : `${current + 1} / ${count}`}
          </span>
          <button
            type="button"
            aria-label="Next slide"
            disabled={count === 0 || current >= count - 1}
            onClick={() => go(1)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
            Close
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {content == null ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="size-5" />
          </div>
        ) : count === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            This page is empty.
          </div>
        ) : (
          <div
            key={`${mode}-${current}`}
            className="flex min-h-0 flex-1 justify-center overflow-y-auto px-8 py-10"
          >
            <div className="present-slide w-full max-w-4xl text-[1.15rem] leading-relaxed">
              {slide?.nodes.map((node) => (
                <NodeRenderer
                  key={node.attrs?.id}
                  node={node}
                  keyPrefix={node.attrs?.id}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {count > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-1 border-t border-border/60 px-4 py-2">
          {slides.map((item, position) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Slide ${position + 1}`}
              title={item.title ?? `Slide ${position + 1}`}
              onClick={() => setIndex(position)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                position === current
                  ? 'w-6 bg-foreground'
                  : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
};
