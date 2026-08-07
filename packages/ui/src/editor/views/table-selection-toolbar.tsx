// ABOUTME: A floating toolbar shown when several table cells are selected, so
// ABOUTME: alignment / background / clear apply to the whole range in one click.
import { type Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { CellSelection } from '@tiptap/pm/tables';
import { AlignCenter, AlignLeft, AlignRight, Eraser } from 'lucide-react';

import { editorColors } from '@colanode/ui/lib/editor';
import { cn } from '@colanode/ui/lib/utils';

interface Props {
  editor: Editor;
  getPos: (() => number | undefined) | undefined;
}

export const TableSelectionToolbar = ({ editor, getPos }: Props) => {
  const info = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const selection = current.state.selection;
      if (!(selection instanceof CellSelection)) {
        return { show: false, count: 0 };
      }
      let count = 0;
      selection.forEachCell(() => {
        count++;
      });
      if (count < 2) {
        return { show: false, count };
      }
      const pos = typeof getPos === 'function' ? getPos() : undefined;
      if (pos == null) {
        return { show: false, count };
      }
      const node = current.state.doc.nodeAt(pos);
      const size = node ? node.nodeSize : 0;
      const anchor = selection.$anchorCell.pos;
      const within = anchor >= pos && anchor <= pos + size;
      return { show: within, count };
    },
  });

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
      className="absolute -top-9 left-0 z-30 flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md"
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
            'size-4 rounded border border-border',
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
