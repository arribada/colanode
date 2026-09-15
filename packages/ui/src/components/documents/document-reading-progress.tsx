// ABOUTME: Right-edge reading-progress minimap for a page — one short line per
// ABOUTME: heading with scrollspy; hovering a line names its chapter, a click jumps.
import { type Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@colanode/ui/components/ui/tooltip';
import { useSplitPane } from '@colanode/ui/contexts/split-pane';
import { headingLevel } from '@colanode/ui/lib/headings';
import { cn } from '@colanode/ui/lib/utils';

interface HeadingItem {
  id: string | null;
  level: number;
  text: string;
  pos: number;
}

interface DocumentReadingProgressProps {
  editor: Editor;
}

// Distance below the top of the reading area at which a heading is considered
// the "current" section for scrollspy purposes.
const ACTIVE_OFFSET = 88;

// Walk the doc collecting every heading with {level, text, pos}. Re-run on
// editor updates so added/removed/renamed headings stay in sync.
const scanHeadings = (editor: Editor): HeadingItem[] => {
  const headings: HeadingItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    const level = headingLevel(node.type.name);
    if (level > 0) {
      const text = node.textContent.trim();
      if (text.length > 0) {
        headings.push({
          id: typeof node.attrs.id === 'string' ? node.attrs.id : null,
          level,
          text,
          pos,
        });
      }
    }
  });
  return headings;
};

// Nearest scrollable ancestor of the editor. Colanode pages scroll inside a
// Radix ScrollArea viewport ([data-slot="scroll-area-viewport"]); fall back to
// any overflow:auto/scroll ancestor, then null (meaning: track the window).
const findScrollContainer = (start: HTMLElement | null): HTMLElement | null => {
  let el: HTMLElement | null = start?.parentElement ?? null;
  while (el) {
    if (el.getAttribute('data-slot') === 'scroll-area-viewport') {
      return el;
    }
    const overflowY = window.getComputedStyle(el).overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
};

// A deeper heading draws a shorter line, so the rail reads as an outline.
const lineWidth = (level: number) =>
  level === 1
    ? 'w-6'
    : level === 2
      ? 'w-5'
      : level === 3
        ? 'w-4'
        : level === 4
          ? 'w-3'
          : 'w-2';

export const DocumentReadingProgress = ({
  editor,
}: DocumentReadingProgressProps) => {
  const inSplitPane = useSplitPane() !== null;
  const [headings, setHeadings] = useState<HeadingItem[]>(() =>
    scanHeadings(editor)
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const rafRef = useRef(0);
  const headingsRef = useRef<HeadingItem[]>(headings);
  headingsRef.current = headings;

  // Re-scan headings whenever the document changes.
  useEffect(() => {
    const rescan = () => setHeadings(scanHeadings(editor));
    editor.on('update', rescan);
    return () => {
      editor.off('update', rescan);
    };
  }, [editor]);

  // Scrollspy: the active heading is the last one whose top has scrolled above
  // a reference line near the top of the reading area. getBoundingClientRect is
  // viewport-relative, so this works whether scrolling happens on a container
  // element or the window.
  const recompute = useCallback(() => {
    const items = headingsRef.current;
    if (items.length === 0) {
      return;
    }

    const dom = editor.view.dom as HTMLElement;
    const scrollEl = findScrollContainer(dom);
    const containerTop = scrollEl ? scrollEl.getBoundingClientRect().top : 0;
    const line = containerTop + ACTIVE_OFFSET;

    let active = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) {
        continue;
      }
      let node: HTMLElement | null = null;
      try {
        node = editor.view.nodeDOM(item.pos) as HTMLElement | null;
      } catch {
        // a heading pos can lag a fast edit -> out-of-range; ignore
      }
      if (!node || typeof node.getBoundingClientRect !== 'function') {
        continue;
      }
      const top = node.getBoundingClientRect().top;
      if (top - line <= 1) {
        active = i;
      } else {
        break;
      }
    }

    // At the very bottom, highlight the last heading — its section may be too
    // short to ever cross the reference line.
    if (scrollEl) {
      if (
        scrollEl.scrollTop + scrollEl.clientHeight >=
        scrollEl.scrollHeight - 2
      ) {
        active = items.length - 1;
      }
    } else {
      const root = document.documentElement;
      if (window.scrollY + window.innerHeight >= root.scrollHeight - 2) {
        active = items.length - 1;
      }
    }

    setActiveIndex((prev) => (prev === active ? prev : active));
  }, [editor]);

  const onScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(recompute);
  }, [recompute]);

  // (Re)bind scroll/resize listeners. Depends on headings.length so that once
  // content exists (and thus a scrollable ancestor), the listeners attach to
  // the right element and the initial active heading is computed.
  useEffect(() => {
    if (headings.length < 2) {
      return;
    }
    const dom = editor.view.dom as HTMLElement;
    const scrollEl = findScrollContainer(dom);
    const target: HTMLElement | Window = scrollEl ?? window;

    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    const initial = requestAnimationFrame(recompute);

    return () => {
      cancelAnimationFrame(initial);
      cancelAnimationFrame(rafRef.current);
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [editor, onScroll, recompute, headings.length]);

  const scrollTo = (heading: HeadingItem, index: number) => {
    let node: HTMLElement | null = null;
    try {
      node = editor.view.nodeDOM(heading.pos) as HTMLElement | null;
    } catch {
      // stale heading pos -> ignore
    }
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveIndex(index);
  };

  // Needs at least two headings to be worth showing.
  if (headings.length < 2) {
    return null;
  }

  return (
    // Fixed to the right gutter, hidden below xl so it never crowds the text
    // column. The wrapper takes no pointer events; only the rail does, so it
    // can never block clicks on the page beneath it.
    <div
      className={cn(
        'pointer-events-none right-1 top-1/2 z-20 hidden -translate-y-1/2 xl:block',
        // A split pane is a normal flow box, so `fixed` resolves against the
        // viewport: in a vertical split this rail parked itself at the middle
        // of the window, 4px from the right edge - exactly where the lower
        // pane's controls sit. Inside a pane, anchor to the pane instead.
        inSplitPane ? 'absolute' : 'fixed'
      )}
    >
      {/* Hovering a line used to unfold a panel listing every heading, which
          read as the page itself changing. Now only the line under the pointer
          grows, and its chapter is named before anyone clicks. */}
      <div className="pointer-events-auto flex max-h-[85vh] flex-col items-end overflow-y-auto overscroll-contain py-2 pl-2 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {headings.map((heading, index) => (
          <Tooltip key={`line-${heading.pos}-${index}`} delayDuration={80}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={heading.text}
                aria-current={index === activeIndex ? 'location' : undefined}
                onClick={() => scrollTo(heading, index)}
                className="group/line flex h-3 w-10 cursor-pointer items-center justify-end outline-none"
              >
                <span
                  className={cn(
                    'h-0.5 rounded-full bg-muted-foreground/45 transition-all duration-150',
                    lineWidth(heading.level),
                    index === activeIndex && 'bg-foreground/80',
                    'group-hover/line:h-1 group-hover/line:w-8 group-hover/line:bg-foreground group-focus-visible/line:h-1 group-focus-visible/line:w-8 group-focus-visible/line:bg-foreground'
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8} className="max-w-64">
              <span className="block truncate">{heading.text}</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};
