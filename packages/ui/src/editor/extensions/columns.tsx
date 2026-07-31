import { mergeAttributes, Node } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      /**
       * Insert a side-by-side column layout with `count` columns (min 2).
       */
      setColumns: (count?: number) => ReturnType;
    };
  }
}

export const ColumnNode = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'column',
        style: 'flex: 1 1 180px; min-width: 180px;',
      }),
      0,
    ];
  },
});

export const ColumnsNode = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column+',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'columns',
        style:
          'display: flex; flex-wrap: wrap; gap: 1rem; align-items: stretch; margin: 0.5rem 0;',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setColumns:
        (count = 2) =>
        ({ chain }) => {
          const columns = Array.from({ length: Math.max(2, count) }, () => ({
            type: 'column',
            content: [{ type: 'paragraph' }],
          }));
          return chain()
            .insertContent({ type: 'columns', content: columns })
            .run();
        },
    };
  },
});
