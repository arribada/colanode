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
import { cn } from '@colanode/ui/lib/utils';

export const TableHeaderNodeView = (props: NodeViewProps) => {
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
  return (
    <NodeViewWrapper
      className="h-full w-full"
    >
      <TableCellContextMenu {...props}>
        <Resizable
          className={cn(
            defaultClasses.tableHeader,
            'relative h-full',
            isActive && 'outline outline-2 outline-primary [outline-offset:-2px]',
            align === 'left' && 'justify-start',
            align === 'center' && 'justify-center',
            align === 'right' && 'justify-end'
          )}
          defaultSize={{
            width: `${colWidth}px`,
          }}
          minWidth={100}
          maxWidth={500}
          size={{
            width: `${colWidth}px`,
          }}
          enable={{
            bottom: false,
            bottomLeft: false,
            bottomRight: false,
            left: false,
            right: !isActive,
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
          <NodeViewContent className="z-0 w-full h-full" />
        </Resizable>
      </TableCellContextMenu>
    </NodeViewWrapper>
  );
};
