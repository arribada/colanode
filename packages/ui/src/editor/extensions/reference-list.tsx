// ABOUTME: Editor node for an auto-built list of figures or tables, mirroring
// ABOUTME: the table-of-contents node but keyed off image / table captions.
import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { ReferenceListNodeView } from '@colanode/ui/editor/views/reference-list';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    referenceList: {
      setTableOfFigures: () => ReturnType;
      setTableOfTables: () => ReturnType;
    };
  }
}

export const ReferenceListNode = Node.create({
  name: 'referenceList',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      kind: {
        default: 'figure',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-kind') === 'table' ? 'table' : 'figure',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-kind': attributes.kind === 'table' ? 'table' : 'figure',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="reference-list"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'reference-list' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReferenceListNodeView);
  },

  addCommands() {
    return {
      setTableOfFigures:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { kind: 'figure' } }),
      setTableOfTables:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { kind: 'table' } }),
    };
  },
});
