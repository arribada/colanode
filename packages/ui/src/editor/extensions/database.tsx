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
    });
  },
});
