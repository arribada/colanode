import { mergeAttributes, Node } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { CalloutNodeView } from '@colanode/ui/editor/views';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /**
       * Wrap the current block into a callout block
       */
      setCallout: () => ReturnType;
    };
  }
}

export const CalloutNode = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      icon: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-icon'),
        renderHTML: (attributes) => {
          if (!attributes.icon) {
            return {};
          }

          return { 'data-icon': attributes.icon };
        },
      },
      color: {
        default: 'default',
        parseHTML: (element) => element.getAttribute('data-color') ?? 'default',
        renderHTML: (attributes) => ({
          'data-color': attributes.color ?? 'default',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }, { tag: 'aside' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'callout',
        class: defaultClasses.callout,
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView);
  },

  addCommands() {
    return {
      setCallout:
        () =>
        ({ state, dispatch }) => {
          const { schema } = state;
          const { $from } = state.selection;

          const block = $from.node($from.depth);
          if (!block.isTextblock) {
            return false;
          }

          const calloutType = schema.nodes[this.name];
          const paragraphType = schema.nodes.paragraph;
          if (!calloutType || !paragraphType) {
            return false;
          }

          try {
            const paragraph = paragraphType.create(null, block.content);
            const callout = calloutType.create(null, paragraph);

            const start = $from.before($from.depth);
            const end = $from.after($from.depth);

            const tr = state.tr.replaceWith(start, end, callout);
            const selectionPos = Math.min(
              start + 2 + block.content.size,
              tr.doc.content.size
            );
            tr.setSelection(TextSelection.create(tr.doc, selectionPos));

            if (dispatch) {
              dispatch(tr);
            }

            return true;
          } catch {
            return false;
          }
        },
    };
  },
});
