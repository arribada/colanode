// ABOUTME: A read-only, auto table of contents rendered at the top of a page
// ABOUTME: when the page's showToc attribute is on. Lists H1/H2/H3 with jump.
import { type Editor } from '@tiptap/react';
import { ListTree } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@colanode/ui/lib/utils';

interface HeadingItem {
  id: string | null;
  level: number;
  text: string;
  pos: number;
}

interface DocumentTocProps {
  editor: Editor;
}

// A lightweight, non-editable table of contents for a whole page. It shares the
// heading-scan approach of the in-editor TableOfContents node view
// (editor/views/table-of-contents.tsx) but renders as a standalone widget
// driven purely by the page's `showToc` attribute — no node is inserted into
// the document, so it stays auto and read-only.
export const DocumentToc = ({ editor }: DocumentTocProps) => {
  const [, setTick] = useState(0);

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

  if (headings.length === 0) {
    return null;
  }

  const scrollTo = (heading: HeadingItem) => {
    const dom = editor.view.nodeDOM(heading.pos) as HTMLElement | null;
    if (dom && typeof dom.scrollIntoView === 'function') {
      dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <nav
      aria-label="Table of contents"
      contentEditable={false}
      className="mb-4 select-none rounded-md border border-border/60 bg-muted/30 p-3"
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ListTree className="size-3.5" />
        <span>Contents</span>
      </div>
      <div className="flex flex-col gap-0.5">
        {headings.map((heading, index) => (
          <button
            key={`${heading.pos}-${index}`}
            type="button"
            onClick={() => scrollTo(heading)}
            className={cn(
              'truncate rounded px-1.5 py-0.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              heading.level === 2 && 'pl-4',
              heading.level === 3 && 'pl-7'
            )}
          >
            {heading.text}
          </button>
        ))}
      </div>
    </nav>
  );
};
