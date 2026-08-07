import { TableCell } from '@tiptap/extension-table/cell';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { TableCellNodeView } from '@colanode/ui/editor/views';

export const TableCellNode = TableCell.extend({
  addNodeView() {
    return ReactNodeViewRenderer(TableCellNodeView, {
      as: 'td',
      className: defaultClasses.tableCellWrapper,
      // Reflect the cell's borderStyle onto the host <td> as a data attribute
      // (leaves the class list untouched). editor.css turns it into the matching
      // border-style / width. Absent / 'default' keeps the built-in 1px border.
      attrs: ({ node }) => ({
        'data-border-style':
          (node.attrs.borderStyle as string | null) ?? 'default',
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
    };
  },
});
