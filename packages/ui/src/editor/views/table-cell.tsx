import { type NodeViewProps } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
} from '@tiptap/react';
import { Resizable } from 're-resizable';

import { updateColumnWidth } from '@colanode/client/lib';
import { defaultClasses } from '@colanode/ui/editor/classes';
import { TableCellContextMenu } from '@colanode/ui/editor/menus/table-cell-context-menu';
import { TableCellDropdownMenu } from '@colanode/ui/editor/menus/table-cell-dropdown-menu';
import { applyFillFromDrag } from '@colanode/ui/editor/views/table-fill-handle';
import { editorColors } from '@colanode/ui/lib/editor';
import { cn } from '@colanode/ui/lib/utils';

export const TableCellNodeView = (props: NodeViewProps) => {
  const state = useEditorState({
    editor: props.editor,
    selector(context) {
      return {
        isActive: context.editor.isActive(
          props.node.type.name,
          props.node.attrs
        ),
      };
    },
  });

  const isActive = state.isActive;
  const colwidthAttr = props.node.attrs.colwidth as number[] | number | null;
  const colWidth = Array.isArray(colwidthAttr)
    ? colwidthAttr.reduce(
        (sum: number, w) => sum + (Number(w) > 0 ? Number(w) : 100),
        0
      )
    : typeof colwidthAttr === 'number' && colwidthAttr > 0
      ? colwidthAttr
      : 100;
  const align = props.node.attrs.align;
  const valign = props.node.attrs.valign;
  const colspan = Number(props.node.attrs.colspan) || 1;
  const rowspan = Number(props.node.attrs.rowspan) || 1;
  // A merged cell must fill the <td> that already spans several columns
  // (the browser handles the span via colspan/rowspan); forcing a single
  // column's fixed width is exactly what made merges render misaligned.
  const isMerged = colspan > 1 || rowspan > 1;
  const cellWidth = isMerged ? '100%' : `${colWidth}px`;
  const backgroundColor = editorColors.find(
    (color) => color.color === props.node.attrs.backgroundColor
  );

  return (
    <NodeViewWrapper>
      <TableCellContextMenu {...props}>
        <Resizable
          className={cn(
            defaultClasses.tableCell,
            'relative',
            isActive && 'outline outline-2 outline-primary [outline-offset:-2px]',
            backgroundColor?.bgClass,
            align === 'left' && 'justify-start',
            align === 'center' && 'justify-center',
            align === 'right' && 'justify-end',
            valign === 'top' && 'items-start',
            valign === 'middle' && 'items-center',
            valign === 'bottom' && 'items-end'
          )}
          defaultSize={{
            width: cellWidth,
          }}
          minWidth={100}
          maxWidth={500}
          size={{
            width: cellWidth,
          }}
          enable={{
            bottom: false,
            bottomLeft: false,
            bottomRight: false,
            left: false,
            right: !isActive && !isMerged,
            top: false,
            topLeft: false,
            topRight: false,
          }}
          handleClasses={{
            right: 'opacity-0 hover:opacity-100 bg-blue-300 dark:bg-blue-900',
          }}
          handleStyles={{
            right: {
              width: '3px',
              right: '-3px',
            },
          }}
          onResizeStop={(_e, _direction, ref) => {
            const newWidth = ref.offsetWidth;
            const pos = props.getPos();
            if (!pos) {
              return;
            }

            updateColumnWidth(props.editor.view, pos, newWidth);
          }}
        >
          {isActive && <TableCellDropdownMenu {...props} />}
          {isActive && !isMerged && (
            <div
              className="absolute -bottom-[3px] -right-[3px] z-20 size-2 cursor-crosshair rounded-[1px] border border-background bg-primary transition-transform hover:scale-125"
              title="Glisser pour remplir une serie (ex. REQ-1 -> REQ-2)"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const pos = props.getPos();
                if (pos === undefined || pos === null) {
                  return;
                }
                const onUp = (up: PointerEvent) => {
                  document.removeEventListener('pointerup', onUp, true);
                  document.body.classList.remove('colanode-table-filling');
                  applyFillFromDrag(props.editor, pos, up.clientX, up.clientY);
                };
                document.body.classList.add('colanode-table-filling');
                document.addEventListener('pointerup', onUp, true);
              }}
            />
          )}
          <NodeViewContent className="z-0 w-full h-full" />
        </Resizable>
      </TableCellContextMenu>
    </NodeViewWrapper>
  );
};
