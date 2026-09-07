import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { DatabaseNodeView } from '@colanode/ui/editor/views';

export const DatabaseNode = Node.create({
  name: 'database',
  group: 'block',
  atom: true,
  defining: true,
  draggable: true,
  addAttributes() {
    return {
      id: {
        default: null,
      },
      inline: {
        default: false,
      },
      // Per-embed filter (Notion-style linked view): restrict the inline
      // database to records whose `filterFieldId` select value is `filterValue`.
      filterFieldId: {
        default: null,
      },
      filterValue: {
        default: null,
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="database"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'database' }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DatabaseNodeView, {
      as: 'database',
      // Interactive controls inside this draggable atom (cell editors, the
      // column-resize handle, buttons, selects) must receive their own
      // keyboard/pointer events. Without this ProseMirror treats typing in a
      // cell input as input over the selected atom and REPLACES the whole
      // embedded database. Returning true tells ProseMirror to ignore those
      // events so the embedded UI stays fully interactive.
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        return Boolean(
          target?.closest?.(
            '.cn-table-field-header, .cn-col-resize-handle, input, textarea, select, button, [contenteditable="true"]'
          )
        );
      },
    });
  },
});
