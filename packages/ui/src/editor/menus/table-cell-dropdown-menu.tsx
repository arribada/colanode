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
import { editorColors } from '@colanode/ui/lib/editor';
import { cn } from '@colanode/ui/lib/utils';

export const TableCellDropdownMenu = ({
  editor,
  node,
  updateAttributes,
}: NodeViewProps) => {
  const textAlign = node.attrs.textAlign ?? 'left';
  const backgroundColor = node.attrs.backgroundColor ?? 'default';

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
              onClick={() => updateAttributes({ align: 'left' })}
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
              onClick={() => updateAttributes({ align: 'center' })}
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
              onClick={() => updateAttributes({ align: 'right' })}
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
            <Highlighter className="size-4 text-muted-foreground" />
            Background Color
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuLabel>Background Color</DropdownMenuLabel>
            {editorColors.map((color) => (
              <DropdownMenuItem
                key={color.color}
                onClick={() =>
                  updateAttributes({ backgroundColor: color.color })
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
