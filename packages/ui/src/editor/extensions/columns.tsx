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

  addAttributes() {
    return {
      // Relative width as a flex-grow weight (default 1 = equal columns). The
      // resize handles (columns-resize.tsx) trade this value between two
      // adjacent columns, keeping their sum constant. Persisted in block attrs.
      width: {
        default: 1,
        parseHTML: (el) => {
          const w = parseFloat(el.getAttribute('data-width') ?? '');
          return Number.isFinite(w) && w > 0 ? w : 1;
        },
        // Style is emitted by the node renderHTML below so it stays a single
        // source of truth; nothing extra to render at the attribute level.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const width = node.attrs.width ?? 1;
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'column',
        'data-width': String(width),
        style: `flex: ${width} 1 0px; min-width: 60px; overflow: hidden;`,
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
          'display: flex; flex-wrap: nowrap; align-items: stretch; margin: 0.5rem 0;',
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
            attrs: { width: 1 },
            content: [{ type: 'paragraph' }],
          }));
          return chain()
            .insertContent({ type: 'columns', content: columns })
            .run();
        },
    };
  },
});
