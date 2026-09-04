import { type NodeViewProps } from '@tiptap/core';
import {
  Trash,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  AlignJustify,
  Check,
  Square,
  Palette,
  Combine,
  Split,
  Paintbrush,
  ClipboardPaste,
  Wand2,
  Captions,
} from 'lucide-react';
import { useState } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@colanode/ui/components/ui/context-menu';
import {
  copyCellStyle,
  getCopiedCellStyle,
} from '@colanode/ui/editor/menus/table-cell-style';
import { TableConditionalColorsDialog } from '@colanode/ui/editor/menus/table-conditional-colors-dialog';
import {
  type ConditionalColorRule,
  parseColorRules,
} from '@colanode/ui/editor/views/table-conditional-colors';
import { editorBorderStyles, editorColors } from '@colanode/ui/lib/editor';
import { cn } from '@colanode/ui/lib/utils';

interface TableCellContextMenuProps extends NodeViewProps {
  children: React.ReactNode;
}

export const TableCellContextMenu = ({
  editor,
  node,
  getPos,
  children,
}: TableCellContextMenuProps) => {
  const textAlign = node.attrs.align ?? 'left';
  const backgroundColor = node.attrs.backgroundColor ?? 'default';
  const borderStyle = node.attrs.borderStyle ?? 'default';
  const borderColor = node.attrs.borderColor ?? 'default';

  const [condOpen, setCondOpen] = useState(false);
  const [tableInfo, setTableInfo] = useState<{
    pos: number;
    columns: string[];
    rules: ConditionalColorRule[];
  } | null>(null);

  const parentTableHasCaption = (() => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos == null) {
      return false;
    }
    try {
      const resolved = editor.state.doc.resolve(pos + 1);
      const table = resolved.node(1);
      return table?.type.name === 'table' && table.attrs.caption != null;
    } catch {
      return false;
    }
  })();

  const toggleTableCaption = () => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos == null) {
      return;
    }
    try {
      const resolved = editor.state.doc.resolve(pos + 1);
      const table = resolved.node(1);
      if (table?.type.name !== 'table') {
        return;
      }
      const tablePos = resolved.before(1);
      const next = table.attrs.caption == null ? '' : null;
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.setNodeAttribute(tablePos, 'caption', next);
          return true;
        })
        .run();
    } catch {
      // not inside a resolvable table -- ignore
    }
  };

  const openConditionalColors = () => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos == null) {
      return;
    }
    try {
      const resolved = editor.state.doc.resolve(pos + 1);
      const table = resolved.node(1);
      if (table?.type.name !== 'table') {
        return;
      }
      const columns: string[] = [];
      table.firstChild?.forEach((cell, _offset, index) => {
        columns.push(cell.textContent.trim() || `Column ${index + 1}`);
      });
      setTableInfo({
        pos: resolved.before(1),
        columns,
        rules: parseColorRules(table.attrs.colorRules),
      });
      setCondOpen(true);
    } catch {
      // not inside a resolvable table -- ignore
    }
  };

  return (
    <>
      <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel>Cell Actions</ContextMenuLabel>
        <ContextMenuItem
          data-testid="editor-table-cell-merge"
          onSelect={() => editor.chain().focus().mergeCells().run()}
        >
          <Combine className="size-4" />
          Merge cells
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="editor-table-cell-split"
          onSelect={() => editor.chain().focus().splitCell().run()}
        >
          <Split className="size-4" />
          Split cell
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          data-testid="editor-table-cell-copy-style"
          onSelect={() =>
            copyCellStyle({
              backgroundColor: (node.attrs.backgroundColor as string) ?? null,
              borderColor: (node.attrs.borderColor as string) ?? null,
              borderStyle: (node.attrs.borderStyle as string) ?? null,
              align: (node.attrs.align as string) ?? null,
              valign: (node.attrs.valign as string) ?? null,
            })
          }
        >
          <Paintbrush className="size-4" />
          Copy style
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="editor-table-cell-paste-style"
          disabled={!getCopiedCellStyle()}
          onSelect={() => {
            const style = getCopiedCellStyle();
            if (!style) return;
            editor
              .chain()
              .focus()
              .setCellAttribute('backgroundColor', style.backgroundColor)
              .setCellAttribute('borderColor', style.borderColor)
              .setCellAttribute('borderStyle', style.borderStyle)
              .setCellAttribute('align', style.align)
              .setCellAttribute('valign', style.valign)
              .run();
          }}
        >
          <ClipboardPaste className="size-4" />
          Paste style
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="editor-table-conditional-colors"
          onSelect={() => openConditionalColors()}
        >
          <Wand2 className="size-4" />
          Conditional colours…
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="editor-table-caption"
          onSelect={() => toggleTableCaption()}
        >
          <Captions className="size-4" />
          {parentTableHasCaption ? 'Remove table caption' : 'Add table caption'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger className="flex gap-2">
            <AlignJustify className="size-4 text-muted-foreground" />
            Alignment
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuLabel>Alignment</ContextMenuLabel>
            <ContextMenuItem
              onSelect={() => editor.chain().focus().setCellAttribute('align', 'left').run()}
              role="menuitemradio"
              aria-checked={textAlign === 'left'}
              data-testid="editor-table-cell-align-left"
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlignLeft className="size-4" />
                Left
              </div>
              {textAlign === 'left' && <Check className="size-4" />}
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => editor.chain().focus().setCellAttribute('align', 'center').run()}
              role="menuitemradio"
              aria-checked={textAlign === 'center'}
              data-testid="editor-table-cell-align-center"
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlignCenter className="size-4" />
                Center
              </div>
              {textAlign === 'center' && <Check className="size-4" />}
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => editor.chain().focus().setCellAttribute('align', 'right').run()}
              role="menuitemradio"
              aria-checked={textAlign === 'right'}
              data-testid="editor-table-cell-align-right"
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlignRight className="size-4" />
                Right
              </div>
              {textAlign === 'right' && <Check className="size-4" />}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="flex gap-2">
            <Highlighter className="size-4 text-muted-foreground" />
            Background Color
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuLabel>Background Color</ContextMenuLabel>
            {editorColors.map((color) => (
              <ContextMenuItem
                key={color.color}
                onSelect={() =>
                  editor.chain().focus().setCellAttribute('backgroundColor', color.color).run()
                }
                role="menuitemradio"
                aria-checked={backgroundColor === color.color}
                data-testid={`editor-table-cell-bg-${color.color}`}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-4 h-4 rounded border border-border',
                      color.bgClass
                    )}
                  />
                  {color.name}
                </div>
                {backgroundColor === color.color && (
                  <Check className="size-4" />
                )}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="flex gap-2">
            <Square className="size-4 text-muted-foreground" />
            Border
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuLabel>Border</ContextMenuLabel>
            {editorBorderStyles.map((option) => (
              <ContextMenuItem
                key={option.value}
                onSelect={() =>
                  editor
                    .chain()
                    .focus()
                    .setCellAttribute('borderStyle', option.value)
                    .run()
                }
                role="menuitemradio"
                aria-checked={borderStyle === option.value}
                data-testid={`editor-table-cell-border-${option.value}`}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn('h-4 w-4 rounded-sm', option.previewClass)}
                  />
                  {option.name}
                </div>
                {borderStyle === option.value && <Check className="size-4" />}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="flex gap-2">
            <Palette className="size-4 text-muted-foreground" />
            Border color
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuLabel>Border color</ContextMenuLabel>
            {editorColors.map((color) => (
              <ContextMenuItem
                key={color.color}
                onSelect={() =>
                  editor
                    .chain()
                    .focus()
                    .setCellAttribute('borderColor', color.color)
                    .run()
                }
                role="menuitemradio"
                aria-checked={borderColor === color.color}
                data-testid={`editor-table-cell-border-color-${color.color}`}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded-sm border-2"
                    style={{
                      borderColor: color.borderColorValue || 'var(--border)',
                    }}
                  />
                  {color.name}
                </div>
                {borderColor === color.color && <Check className="size-4" />}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuLabel>Column Actions</ContextMenuLabel>
        <ContextMenuItem
          data-testid="editor-table-column-insert-before"
          onSelect={() => {
            editor.chain().addColumnBefore().focus().run();
          }}
        >
          <ArrowLeft className="size-4" />
          Insert column left
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="editor-table-column-insert-after"
          onSelect={() => {
            editor.chain().addColumnAfter().focus().run();
          }}
        >
          <ArrowRight className="size-4" />
          Insert column right
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="editor-table-column-delete"
          onSelect={() => {
            editor.chain().focus().deleteColumn().run();
          }}
        >
          <Trash className="size-4" />
          Delete column
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuLabel>Row Actions</ContextMenuLabel>
        <ContextMenuItem
          data-testid="editor-table-row-insert-before"
          onSelect={() => {
            editor.chain().addRowBefore().focus().run();
          }}
        >
          <ArrowUp className="size-4" />
          Insert row above
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="editor-table-row-insert-after"
          onSelect={() => {
            editor.chain().addRowAfter().focus().run();
          }}
        >
          <ArrowDown className="size-4" />
          Insert row below
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="editor-table-row-delete"
          onSelect={() => {
            editor.chain().focus().deleteRow().run();
          }}
        >
          <Trash className="size-4" />
          Delete row
        </ContextMenuItem>
      </ContextMenuContent>
      </ContextMenu>
      {tableInfo && (
        <TableConditionalColorsDialog
          editor={editor}
          tablePos={tableInfo.pos}
          columns={tableInfo.columns}
          initialRules={tableInfo.rules}
          open={condOpen}
          onOpenChange={setCondOpen}
        />
      )}
    </>
  );
};
