// ABOUTME: Renders a table of figures or a table of tables by scanning the doc
// ABOUTME: for captioned images / captioned tables, numbered and click-to-scroll.
import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { Image, Table2 } from 'lucide-react';
import { useEffect, useState } from 'react';


interface ReferenceItem {
  label: string;
  text: string;
  pos: number;
}

export const ReferenceListNodeView = ({ editor, node }: NodeViewProps) => {
  const kind = node.attrs.kind === 'table' ? 'table' : 'figure';

  const [, setTick] = useState(0);
  useEffect(() => {
    const rerender = () => setTick((n) => n + 1);
    editor.on('update', rerender);
    return () => {
      editor.off('update', rerender);
    };
  }, [editor]);

  // Captions only exist on image files (the caption UI is image-only) and on
  // tables, so a non-null caption is enough to identify each entry.
  const items: ReferenceItem[] = [];
  let counter = 0;
  editor.state.doc.descendants((child, pos) => {
    if (kind === 'figure') {
      if (child.type.name === 'file' && child.attrs.caption != null) {
        counter += 1;
        items.push({
          label: `Figure ${counter}`,
          text: String(child.attrs.caption ?? '').trim(),
          pos,
        });
      }
    } else if (child.type.name === 'table' && child.attrs.caption != null) {
      counter += 1;
      items.push({
        label: `Table ${counter}`,
        text: String(child.attrs.caption ?? '').trim(),
        pos,
      });
    }
    return true;
  });

  const scrollTo = (item: ReferenceItem) => {
    const dom = editor.view.nodeDOM(item.pos) as HTMLElement | null;
    if (dom && typeof dom.scrollIntoView === 'function') {
      dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const Icon = kind === 'table' ? Table2 : Image;
  const title = kind === 'table' ? 'Table des tableaux' : 'Table des figures';
  const emptyHint =
    kind === 'table'
      ? 'Ajoutez une légende à un tableau (clic droit dans le tableau) pour le lister ici.'
      : 'Ajoutez une légende à une image pour la lister ici.';

  return (
    <NodeViewWrapper
      data-type="reference-list"
      className="my-2 rounded-md border border-border/60 bg-muted/30 p-3"
    >
      <div contentEditable={false} className="flex select-none flex-col gap-0.5">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" />
          <span>{title}</span>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyHint}</p>
        ) : (
          items.map((item, index) => (
            <button
              key={`${item.pos}-${index}`}
              type="button"
              onClick={() => scrollTo(item)}
              className="flex items-center gap-2 truncate rounded px-1.5 py-0.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <span className="shrink-0 font-medium text-foreground">
                {item.label}
              </span>
              <span className="truncate">{item.text || '—'}</span>
            </button>
          ))
        )}
      </div>
    </NodeViewWrapper>
  );
};
