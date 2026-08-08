import { type NodeViewProps } from '@tiptap/core';
import { useEffect, useRef } from 'react';
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
import {
  type AggregateKind,
  computeColumnAggregate,
  formatAggregate,
} from '@colanode/ui/editor/views/table-aggregate';
import { parseNumberLoose } from '@colanode/ui/editor/views/table-sort';
import { formatNumber, isNumericFormat } from '@colanode/ui/lib/number-format';
import { editorColors } from '@colanode/ui/lib/editor';
import { cn } from '@colanode/ui/lib/utils';

export const TableCellNodeView = (props: NodeViewProps) => {
  // Track the fill drag's document listener so a mid-drag unmount can't leak
  // it (or leave the grabbing body class stuck / fire against a dead editor).
  const fillUpRef = useRef<((event: PointerEvent) => void) | null>(null);
  useEffect(
    () => () => {
      if (fillUpRef.current) {
        document.removeEventListener('pointerup', fillUpRef.current, true);
        document.body.classList.remove('colanode-table-filling');
      }
    },
    []
  );
  const aggregateAttr = props.node.attrs.aggregate as string | null;
  const isAggregate = aggregateAttr != null && aggregateAttr !== 'none';
  const aggregateKind = aggregateAttr as AggregateKind;
  const state = useEditorState({
    editor: props.editor,
    selector(context) {
      let aggregateValue: number | null = null;
      if (isAggregate && typeof props.getPos === 'function') {
        const pos = props.getPos();
        if (pos != null) {
          aggregateValue = computeColumnAggregate(
            context.editor.state,
            pos,
            aggregateKind
          );
        }
      }
      return {
        isActive: context.editor.isActive(
          props.node.type.name,
          props.node.attrs
        ),
        aggregateValue,
      };
    },
  });

  const isActive = state.isActive;
  const numberFormat = props.node.attrs.numberFormat as string | null;
  // Show the formatted number only when the cell is not being edited; click
  // in (isActive) to see/edit the raw value -- classic spreadsheet behavior.
  const showFormatted =
    isNumericFormat(numberFormat) && !isActive && !isAggregate;
  const formattedValue = showFormatted
    ? (() => {
        const parsed = parseNumberLoose(props.node.textContent);
        return parsed === null
          ? props.node.textContent
          : formatNumber(parsed, numberFormat);
      })()
    : null;
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
    <NodeViewWrapper
      className={cn('h-full w-full', backgroundColor?.bgClass)}
    >
      <TableCellContextMenu {...props}>
        <Resizable
          className={cn(
            defaultClasses.tableCell,
            'relative',
            isActive && 'outline outline-2 outline-primary [outline-offset:-2px]',
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
          {isActive && !isMerged && !isAggregate && (
            <div
              className="absolute -bottom-[3px] -right-[3px] z-20 size-2 cursor-crosshair rounded-[1px] border border-background bg-primary transition-transform hover:scale-125"
              title="Drag to fill a series (e.g. REQ-1 → REQ-2)"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (typeof props.getPos !== 'function') {
                  return;
                }
                const onUp = (up: PointerEvent) => {
                  document.removeEventListener('pointerup', onUp, true);
                  fillUpRef.current = null;
                  document.body.classList.remove('colanode-table-filling');
                  // Resolve the source cell position at DROP -- getPos() is a
                  // live getter, so a concurrent edit during the drag can't make
                  // it stale and target the wrong cell.
                  const pos = props.getPos();
                  if (pos === undefined || pos === null) {
                    return;
                  }
                  applyFillFromDrag(props.editor, pos, up.clientX, up.clientY);
                };
                fillUpRef.current = onUp;
                document.body.classList.add('colanode-table-filling');
                document.addEventListener('pointerup', onUp, true);
              }}
            />
          )}
          {isAggregate && (
            <span
              contentEditable={false}
              className="pointer-events-none absolute inset-0 flex items-center justify-end px-2 font-medium tabular-nums text-foreground"
              title="Column summary"
            >
              {state.aggregateValue !== null &&
              isNumericFormat(numberFormat) &&
              aggregateKind !== 'count'
                ? formatNumber(state.aggregateValue, numberFormat)
                : formatAggregate(state.aggregateValue, aggregateKind)}
            </span>
          )}
          {!isAggregate && showFormatted && (
            <span
              contentEditable={false}
              className="pointer-events-none absolute inset-0 flex items-center justify-end px-2 tabular-nums"
            >
              {formattedValue}
            </span>
          )}
          <NodeViewContent
            className={cn(
              'z-0 h-full w-full',
              (isAggregate || showFormatted) && 'invisible'
            )}
          />
        </Resizable>
      </TableCellContextMenu>
    </NodeViewWrapper>
  );
};
