import { NodeViewProps } from '@tiptap/core';
import {
  Trash,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  EllipsisVertical,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  AlignJustify,
  Check,
  Combine,
  Split,
  Heading,
  Square,
  Palette,
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { editorBorderStyles, editorColors } from '@colanode/ui/lib/editor';
import { cn } from '@colanode/ui/lib/utils';
import {
  activeTableColumn,
  buildColumnSort,
  type SortDirection,
} from '@colanode/ui/editor/views/table-sort';

export const TableCellDropdownMenu = ({
  editor,
  node,
}: NodeViewProps) => {
  const textAlign = node.attrs.align ?? 'left';
  const backgroundColor = node.attrs.backgroundColor ?? 'default';
  const borderStyle = node.attrs.borderStyle ?? 'default';
  const borderColor = node.attrs.borderColor ?? 'default';
  const verticalAlign = node.attrs.valign ?? 'middle';

  const sortColumn = (direction: SortDirection) => {
    const target = activeTableColumn(editor.state);
    if (!target) {
      return;
    }
    const { tr, result } = buildColumnSort(
      editor.state,
      target.tablePos,
      target.colIndex,
      direction
    );
    if (tr && result === 'sorted') {
      editor.view.dispatch(tr);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Cell actions"
          data-testid="editor-table-cell-menu-trigger"
          className={cn(
            'absolute top-1/2 -right-2 transform -translate-y-1/2 bg-secondary py-1 cursor-pointer border border-border rounded z-10'
          )}
        >
          <EllipsisVertical className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="w-52">
        <DropdownMenuLabel>Cell Actions</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex gap-2">
            <AlignJustify className="size-4 text-muted-foreground" />
            Alignment
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuLabel>Alignment</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().setCellAttribute('align', 'left').run()}
              role="menuitemradio"
              aria-checked={textAlign === 'left'}
              data-testid="editor-table-dropdown-cell-align-left"
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlignLeft className="size-4" />
                Left
              </div>
              {textAlign === 'left' && <Check className="size-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().setCellAttribute('align', 'center').run()}
              role="menuitemradio"
              aria-checked={textAlign === 'center'}
              data-testid="editor-table-dropdown-cell-align-center"
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlignCenter className="size-4" />
                Center
              </div>
              {textAlign === 'center' && <Check className="size-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().setCellAttribute('align', 'right').run()}
              role="menuitemradio"
              aria-checked={textAlign === 'right'}
              data-testid="editor-table-dropdown-cell-align-right"
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlignRight className="size-4" />
                Right
              </div>
              {textAlign === 'right' && <Check className="size-4" />}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex gap-2">
            <AlignJustify className="size-4 text-muted-foreground" />
            Vertical align
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuLabel>Vertical align</DropdownMenuLabel>
            {(['top', 'middle', 'bottom'] as const).map((value) => (
              <DropdownMenuItem
                key={value}
                onClick={() =>
                  editor.chain().focus().setCellAttribute('valign', value).run()
                }
                role="menuitemradio"
                aria-checked={verticalAlign === value}
                className="flex items-center justify-between capitalize"
              >
                {value}
                {verticalAlign === value && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex gap-2">
            <Highlighter className="size-4 text-muted-foreground" />
            Background Color
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuLabel>Background Color</DropdownMenuLabel>
            {editorColors.map((color) => (
              <DropdownMenuItem
                key={color.color}
                onClick={() =>
                  editor.chain().focus().setCellAttribute('backgroundColor', color.color).run()
                }
                role="menuitemradio"
                aria-checked={backgroundColor === color.color}
                data-testid={`editor-table-dropdown-cell-bg-${color.color}`}
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
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex gap-2">
            <Square className="size-4 text-muted-foreground" />
            Border
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuLabel>Border</DropdownMenuLabel>
            {editorBorderStyles.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .setCellAttribute('borderStyle', option.value)
                    .run()
                }
                role="menuitemradio"
                aria-checked={borderStyle === option.value}
                data-testid={`editor-table-dropdown-cell-border-${option.value}`}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn('h-4 w-4 rounded-sm', option.previewClass)}
                  />
                  {option.name}
                </div>
                {borderStyle === option.value && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex gap-2">
            <Palette className="size-4 text-muted-foreground" />
            Border color
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuLabel>Border color</DropdownMenuLabel>
            {editorColors.map((color) => (
              <DropdownMenuItem
                key={color.color}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .setCellAttribute('borderColor', color.color)
                    .run()
                }
                role="menuitemradio"
                aria-checked={borderColor === color.color}
                data-testid={`editor-table-dropdown-cell-border-color-${color.color}`}
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
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Column Actions</DropdownMenuLabel>
        <DropdownMenuItem
          data-testid="editor-table-dropdown-column-insert-before"
          onClick={() => {
            editor.chain().addColumnBefore().focus().run();
          }}
        >
          <ArrowLeft className="size-4" />
          Insert column left
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="editor-table-dropdown-column-insert-after"
          onClick={() => {
            editor.chain().addColumnAfter().focus().run();
          }}
        >
          <ArrowRight className="size-4" />
          Insert column right
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="editor-table-dropdown-column-delete"
          onClick={() => {
            editor.chain().focus().deleteColumn().run();
          }}
        >
          <Trash className="size-4" />
          Delete column
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="editor-table-dropdown-column-sort-asc"
          onClick={() => sortColumn('asc')}
        >
          <ArrowDownNarrowWide className="size-4" />
          Sort ascending
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="editor-table-dropdown-column-sort-desc"
          onClick={() => sortColumn('desc')}
        >
          <ArrowUpNarrowWide className="size-4" />
          Sort descending
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Row Actions</DropdownMenuLabel>
        <DropdownMenuItem
          data-testid="editor-table-dropdown-row-insert-before"
          onClick={() => {
            editor.chain().addRowBefore().focus().run();
          }}
        >
          <ArrowUp className="size-4" />
          Insert row above
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="editor-table-dropdown-row-insert-after"
          onClick={() => {
            editor.chain().addRowAfter().focus().run();
          }}
        >
          <ArrowDown className="size-4" />
          Insert row below
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="editor-table-dropdown-row-delete"
          onClick={() => {
            editor.chain().focus().deleteRow().run();
          }}
        >
          <Trash className="size-4" />
          Delete row
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Cell Actions</DropdownMenuLabel>
        <DropdownMenuItem
          data-testid="editor-table-dropdown-cell-merge"
          onClick={() => {
            editor.chain().focus().mergeCells().run();
          }}
        >
          <Combine className="size-4" />
          Merge cells
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="editor-table-dropdown-cell-split"
          onClick={() => {
            editor.chain().focus().splitCell().run();
          }}
        >
          <Split className="size-4" />
          Split cell
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="editor-table-dropdown-header-row"
          onClick={() => {
            editor.chain().focus().toggleHeaderRow().run();
          }}
        >
          <Heading className="size-4" />
          Toggle header row
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
