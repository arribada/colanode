import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { ListTree } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@colanode/ui/lib/utils';

interface HeadingItem {
  level: number;
  text: string;
  pos: number;
}

export const TableOfContentsNodeView = ({ editor }: NodeViewProps) => {
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
          level: name === 'heading1' ? 1 : name === 'heading2' ? 2 : 3,
          text,
          pos,
        });
      }
    }
  });

  const scrollTo = (pos: number) => {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    if (dom && typeof dom.scrollIntoView === 'function') {
      dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          headings.map((heading, index) => (
            <button
              key={`${heading.pos}-${index}`}
              type="button"
              onClick={() => scrollTo(heading.pos)}
              className={cn(
                'truncate rounded px-1.5 py-0.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                heading.level === 2 && 'pl-4',
                heading.level === 3 && 'pl-7'
              )}
            >
              {heading.text}
            </button>
          ))
        )}
      </div>
    </NodeViewWrapper>
  );
};
