import { InputRule } from '@tiptap/core';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { DividerNodeView } from '@colanode/ui/editor/views/divider';

export const DividerNode = HorizontalRule.extend({
  addAttributes() {
    return {
      // Visual style of the rule. Persisted in block attrs, so it survives
      // reload. Defaults to the original thin line for existing dividers.
      variant: {
        default: 'line',
        parseHTML: (el) => el.getAttribute('data-variant') ?? 'line',
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant ?? 'line' }),
      },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^(?:---|—-|___\s|\*\*\*\s)$/,
        handler: ({ state, range }) => {
          const attributes = {};

          const { tr } = state;
          const start = range.from;
          const end = range.to;

          tr.insert(start - 1, this.type.create(attributes)).delete(
            tr.mapping.map(start),
            tr.mapping.map(end)
          );
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DividerNodeView);
  },
});
