import { Table } from '@tiptap/extension-table/table';
import { Plugin } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { TableNodeView } from '@colanode/ui/editor/views/table';
import {
  parseClipboardGrid,
  pasteGridAtSelection,
  tableFromSelection,
} from '@colanode/ui/editor/views/table-csv';

export const TableNode = Table.configure({
  allowTableNodeSelection: true,
  cellMinWidth: 100,
}).extend({
  addNodeView() {
    return ReactNodeViewRenderer(TableNodeView, {
      contentDOMElementTag: 'tbody',
    });
  },
  addProseMirrorPlugins() {
    return [
      // Keep the base table plugins (tableEditing: cell selection, arrow
      // nav, column resizing) -- then add spreadsheet paste on top.
      ...(this.parent?.() ?? []),
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            if (!tableFromSelection(view.state)) {
              return false;
            }
            // Only grid-fill for a genuine spreadsheet/table copy -- those carry
            // an HTML <table> on the clipboard. Never for a plain line of prose
            // that merely contains a comma/tab (that would overwrite adjacent
            // cells); let it fall through to the normal single-cell paste.
            const html = event.clipboardData?.getData('text/html') ?? '';
            if (!/<table[\s>]/i.test(html)) {
              return false;
            }
            const text =
              event.clipboardData?.getData('text/plain') ?? '';
            const grid = parseClipboardGrid(text);
            if (!grid) {
              return false;
            }
            return pasteGridAtSelection(view, grid);
          },
        },
      }),
    ];
  },
});
