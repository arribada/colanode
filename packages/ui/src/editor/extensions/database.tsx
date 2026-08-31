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
  renderHTML({ HTMLAttributes }) {
    return ['page', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DatabaseNodeView, {
      as: 'database',
      // A column-resize handle inside the embedded table must not be hijacked by
      // this draggable atom: tell ProseMirror to ignore pointer events that start
      // on a resize handle so re-resizable can drive the resize itself.
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        return Boolean(target?.closest?.('.cn-col-resize-handle'));
      },
    });
  },
});
