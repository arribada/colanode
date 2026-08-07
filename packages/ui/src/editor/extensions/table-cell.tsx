import { TableCell } from '@tiptap/extension-table/cell';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { TableCellNodeView } from '@colanode/ui/editor/views';

export const TableCellNode = TableCell.extend({
  addNodeView() {
    return ReactNodeViewRenderer(TableCellNodeView, {
      as: 'td',
      className: defaultClasses.tableCellWrapper,
      // Reflect the cell's borderStyle / borderColor onto the host <td> as data
      // attributes (leaves the class list untouched). editor.css turns them into
      // the matching border-style / width and border-color. Absent / 'default'
      // keeps the built-in 1px border in its default color.
      attrs: ({ node }) => ({
        'data-border-style':
          (node.attrs.borderStyle as string | null) ?? 'default',
        'data-border-color':
          (node.attrs.borderColor as string | null) ?? 'default',
        // Apply the merge spans to the host cell so merged cells actually span
        // visually (the custom NodeView bypasses tiptap's default cell render).
        colspan: String((node.attrs.colspan as number | null) ?? 1),
        rowspan: String((node.attrs.rowspan as number | null) ?? 1),
      }),
    });
  },
  addAttributes() {
    return {
      colspan: {
        default: 1,
      },
      rowspan: {
        default: 1,
      },
      colwidth: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const colwidth = element.getAttribute('colwidth');
          const value = colwidth
            ? colwidth.split(',').map((width: string) => parseInt(width, 10))
            : null;

          return value;
        },
      },
      align: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-align'),
      },
      backgroundColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-background-color'),
      },
      borderStyle: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-border-style'),
      },
      borderColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-border-color'),
      },
    };
  },
});
