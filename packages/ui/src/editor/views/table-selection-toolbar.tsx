// ABOUTME: A floating toolbar shown when several table cells are selected, so
// ABOUTME: alignment / background / clear apply to the whole range in one click.
import { type Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { useEditorState } from '@tiptap/react';
import { AlignCenter, AlignLeft, AlignRight, Eraser } from 'lucide-react';
import { type RefObject, useLayoutEffect, useState } from 'react';

import { editorColors } from '@colanode/ui/lib/editor';
import { cn } from '@colanode/ui/lib/utils';

interface Props {
  editor: Editor;
  getPos: (() => number | undefined) | undefined;
  containerRef: RefObject<HTMLDivElement | null>;
}

export const TableSelectionToolbar = ({
  editor,
  getPos,
  containerRef,
}: Props) => {
  const info = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const selection = current.state.selection;
      if (!(selection instanceof CellSelection)) {
        return { show: false, count: 0, anchorPos: null };
      }
      let count = 0;
      selection.forEachCell(() => {
        count++;
      });
      if (count < 2) {
        return { show: false, count, anchorPos: null };
      }
      const pos = typeof getPos === 'function' ? getPos() : undefined;
      if (pos == null) {
        return { show: false, count, anchorPos: null };
      }
      const node = current.state.doc.nodeAt(pos);
      const size = node ? node.nodeSize : 0;
      const anchor = selection.$anchorCell.pos;
      const within = anchor >= pos && anchor <= pos + size;
      return { show: within, count, anchorPos: within ? anchor : null };
    },
  });

  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!info.show || info.anchorPos == null || !containerRef.current) {
      setBox(null);
      return;
    }
    const dom = editor.view.nodeDOM(info.anchorPos);
    const cell =
      dom instanceof HTMLElement ? dom : ((dom as Node)?.parentElement ?? null);
    if (!cell) {
      setBox(null);
      return;
    }
    const cellRect = cell.getBoundingClientRect();
    const contRect = containerRef.current.getBoundingClientRect();
    const TOOLBAR_HEIGHT = 40;
    let top = cellRect.top - contRect.top - TOOLBAR_HEIGHT;
    if (top < 0) {
      // No room above (near the table top): drop it just inside the cell.
      top = cellRect.top - contRect.top + 2;
    }
    const maxLeft = Math.max(0, contRect.width - 280);
    const left = Math.min(maxLeft, Math.max(0, cellRect.left - contRect.left));
    setBox({ top, left });
  }, [info.show, info.anchorPos, editor, containerRef]);

  if (!info.show) {
    return null;
  }

  const setAttr = (attr: string, value: string | null) =>
    editor.chain().focus().setCellAttribute(attr, value).run();

  const clearFormatting = () =>
    editor
      .chain()
      .focus()
      .setCellAttribute('align', null)
      .setCellAttribute('valign', null)
      .setCellAttribute('backgroundColor', null)
      .setCellAttribute('borderStyle', null)
      .setCellAttribute('borderColor', null)
      .run();

  const iconButton =
    'flex size-6 items-center justify-center rounded hover:bg-accent text-muted-foreground';

  return (
    <div
      className="absolute z-30 flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md"
      style={{ top: box?.top ?? -36, left: box?.left ?? 0 }}
      contentEditable={false}
    >
      <span className="px-1 text-xs tabular-nums text-muted-foreground">
        {info.count}
      </span>
      <div className="mx-0.5 h-4 w-px bg-border" />
      <button
        type="button"
        className={iconButton}
        title="Align left"
        onClick={() => setAttr('align', 'left')}
      >
        <AlignLeft className="size-4" />
      </button>
      <button
        type="button"
        className={iconButton}
        title="Align center"
        onClick={() => setAttr('align', 'center')}
      >
        <AlignCenter className="size-4" />
      </button>
      <button
        type="button"
        className={iconButton}
        title="Align right"
        onClick={() => setAttr('align', 'right')}
      >
        <AlignRight className="size-4" />
      </button>
      <div className="mx-0.5 h-4 w-px bg-border" />
      {editorColors.slice(0, 6).map((color) => (
        <button
          type="button"
          key={color.color}
          title={color.name}
          onClick={() => setAttr('backgroundColor', color.color)}
          className={cn(
            'size-4 rounded border border-border transition-opacity hover:opacity-80',
            color.bgClass
          )}
        />
      ))}
      <div className="mx-0.5 h-4 w-px bg-border" />
      <button
        type="button"
        className={iconButton}
        title="Clear formatting"
        onClick={clearFormatting}
      >
        <Eraser className="size-4" />
      </button>
    </div>
  );
};
