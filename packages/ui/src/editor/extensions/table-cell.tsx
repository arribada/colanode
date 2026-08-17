import { TableCell } from '@tiptap/extension-table/cell';
import { TextSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { TableCellNodeView } from '@colanode/ui/editor/views';

export const TableCellNode = TableCell.extend({
  // Ctrl/Cmd+A inside a cell selects only that cell's text; pressing it again
  // (the whole cell already covered) falls through to the editor's select-all.
  addKeyboardShortcuts() {
    return {
      'Mod-a': () => {
        const { state, view } = this.editor;
        const { $from, $to } = state.selection;
        let depth = $from.depth;
        while (
          depth > 0 &&
          $from.node(depth).type.name !== 'tableCell' &&
          $from.node(depth).type.name !== 'tableHeader'
        ) {
          depth--;
        }
        if (depth === 0) {
          return false;
        }
        const cell = $from.node(depth);
        const cellStart = $from.start(depth);
        const cellEnd = cellStart + cell.content.size;
        if ($from.pos <= cellStart && $to.pos >= cellEnd) {
          return false;
        }
        view.dispatch(
          state.tr
            .setSelection(TextSelection.create(state.doc, cellStart, cellEnd))
            .scrollIntoView()
        );
        return true;
      },
    };
  },
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
        'data-valign': (node.attrs.valign as string | null) ?? 'middle',
        'data-number-format':
          (node.attrs.numberFormat as string | null) ?? 'none',
        'data-aggregate': (node.attrs.aggregate as string | null) ?? 'none',
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
      valign: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-valign'),
      },
      numberFormat: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-number-format'),
      },
      aggregate: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-aggregate'),
      },
    };
  },
});
