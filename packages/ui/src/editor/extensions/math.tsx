import { InputRule, mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { MathBlockNodeView, MathInlineNodeView } from '@colanode/ui/editor/views';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathInline: {
      /**
       * Insert an inline math node at the cursor
       */
      insertMathInline: () => ReturnType;
    };
    mathBlock: {
      /**
       * Insert a math block at the cursor
       */
      insertMathBlock: () => ReturnType;
    };
  }
}

// Inline LaTeX rendered with KaTeX. The source is kept in the `latex`
// attribute; the node itself is an atom (no editable content). The `id`
// attribute is defined locally (inline nodes are not covered by the
// IdExtension global attribute list) so the id plugin can assign one.
export const MathInlineNode = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
      },
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') ?? '',
        renderHTML: (attributes) => ({
          'data-latex': (attributes.latex as string | null) ?? '',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'math-inline' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineNodeView, {
      as: 'span',
      className: 'inline',
    });
  },

  addInputRules() {
    return [
      // $...$ becomes inline math. The content must not start or end with
      // whitespace so plain dollar amounts ("$5 and $6") are left alone.
      new InputRule({
        find: /\$([^\s$](?:[^$\n]*[^\s$])?)\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          if (!latex) {
            return;
          }

          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create({ latex })
          );
        },
      }),
    ];
  },

  addCommands() {
    return {
      insertMathInline:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { latex: '' },
          });
        },
    };
  },
});

// Display-mode LaTeX block rendered with KaTeX. Like the inline variant the
// source lives in the `latex` attribute; the block id comes from the
// IdExtension global attributes.
export const MathBlockNode = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') ?? '',
        renderHTML: (attributes) => ({
          'data-latex': (attributes.latex as string | null) ?? '',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'math-block' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockNodeView);
  },

  addInputRules() {
    return [
      // Typing $$ followed by a space at the start of a line inserts a
      // math block (same insertion pattern as the divider input rule).
      new InputRule({
        find: /^\$\$\s$/,
        handler: ({ state, range }) => {
          const { tr } = state;
          const start = range.from;
          const end = range.to;

          tr.insert(start - 1, this.type.create({ latex: '' })).delete(
            tr.mapping.map(start),
            tr.mapping.map(end)
          );
        },
      }),
    ];
  },

  addCommands() {
    return {
      insertMathBlock:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { latex: '' },
          });
        },
    };
  },
});
