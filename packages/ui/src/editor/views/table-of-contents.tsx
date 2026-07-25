import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { ListTree } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@colanode/ui/lib/utils';

interface HeadingItem {
  id: string | null;
  level: number;
  text: string;
  pos: number;
}

export const TableOfContentsNodeView = ({ editor }: NodeViewProps) => {
  const [, setTick] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const rerender = () => setTick((n) => n + 1);
    editor.on('update', rerender);
    return () => {
      editor.off('update', rerender);
    };
  }, [editor]);

  const headings: HeadingItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name === 'heading1' || name === 'heading2' || name === 'heading3') {
      const text = node.textContent.trim();
      if (text.length > 0) {
        headings.push({
          id: typeof node.attrs.id === 'string' ? node.attrs.id : null,
          level: name === 'heading1' ? 1 : name === 'heading2' ? 2 : 3,
          text,
          pos,
        });
      }
    }
  });

  // Scroll-spy: highlight the heading currently in view. Headings render a
  // `data-id` (see IdExtension) that matches node.attrs.id, so the TOC entries
  // and the DOM headings can be reconciled without extra bookkeeping.
  const headingIds = headings.map((heading) => heading.id ?? '').join('|');
  useEffect(() => {
    const root = editor.view.dom as HTMLElement;
    const elements = Array.from(
      root.querySelectorAll<HTMLElement>(
        'h1[data-id], h2[data-id], h3[data-id]'
      )
    ).filter((el) => (el.textContent ?? '').trim().length > 0);

    if (elements.length === 0) {
      setActiveId(null);
      return;
    }

    // A heading counts as "current" while it sits in the top band of the
    // viewport. When several are tracked, the first one still intersecting
    // (document order) wins; when none intersect (reading body copy far below
    // a heading) we keep the previous highlight rather than blanking it.
    const intersecting = new Map<string, boolean>();
    const pickActive = () => {
      for (const el of elements) {
        const id = el.getAttribute('data-id');
        if (id && intersecting.get(id)) {
          setActiveId(id);
          return;
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-id');
          if (id) {
            intersecting.set(id, entry.isIntersecting);
          }
        }
        pickActive();
      },
      { rootMargin: '0px 0px -80% 0px', threshold: 0 }
    );

    for (const el of elements) {
      observer.observe(el);
    }

    // Seed an initial highlight = the lowest heading already scrolled to/above
    // the top of the viewport, so the TOC is correct before the first scroll.
    let seeded: string | null = elements[0]?.getAttribute('data-id') ?? null;
    for (const el of elements) {
      if (el.getBoundingClientRect().top <= 130) {
        seeded = el.getAttribute('data-id');
      }
    }
    setActiveId(seeded);

    return () => observer.disconnect();
  }, [editor, headingIds]);

  const scrollTo = (heading: HeadingItem) => {
    const dom = editor.view.nodeDOM(heading.pos) as HTMLElement | null;
    if (dom && typeof dom.scrollIntoView === 'function') {
      dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (heading.id) {
      setActiveId(heading.id);
    }
  };

  return (
    <NodeViewWrapper
      data-type="table-of-contents"
      className="my-2 rounded-md border border-border/60 bg-muted/30 p-3"
    >
      <div contentEditable={false} className="flex select-none flex-col gap-0.5">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ListTree className="size-3.5" />
          <span>Sommaire</span>
        </div>
        {headings.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Ajoutez des titres (H1/H2/H3) pour construire le sommaire.
          </p>
        ) : (
          headings.map((heading, index) => {
            const isActive = heading.id != null && heading.id === activeId;
            return (
              <button
                key={`${heading.pos}-${index}`}
                type="button"
                onClick={() => scrollTo(heading)}
                aria-current={isActive ? 'location' : undefined}
                className={cn(
                  'flex items-center gap-2 truncate rounded px-1.5 py-0.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  heading.level === 2 && 'pl-4',
                  heading.level === 3 && 'pl-7',
                  isActive && 'bg-accent font-medium text-foreground'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-3.5 w-0.5 shrink-0 rounded-full transition-colors',
                    isActive ? 'bg-primary' : 'bg-transparent'
                  )}
                />
                <span className="truncate">{heading.text}</span>
              </button>
            );
          })
        )}
      </div>
    </NodeViewWrapper>
  );
};
