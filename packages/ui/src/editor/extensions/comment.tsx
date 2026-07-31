import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// Notion-style inline comment mark. Carries a threadId that ties a run of
// selected text to a set of `message` nodes (anchorId === threadId) parented to
// the page. The mark round-trips through the generic block-leaf marks schema
// (packages/core registry/block.ts), so no server/storage change is required
// for the highlight itself — only the message.anchorId needs a server rebuild.
export interface CommentMarkOptions {
  // Invoked when the user clicks highlighted (commented) text. Wired by the
  // document editor to open the comments panel filtered to the thread.
  onCommentClick: ((threadId: string) => void) | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /**
       * Apply a comment mark carrying the given thread id to the selection.
       */
      setComment: (threadId: string) => ReturnType;
      /**
       * Remove the comment mark from the selection.
       */
      unsetComment: () => ReturnType;
    };
  }
}

export const CommentMark = Mark.create<CommentMarkOptions>({
  name: 'comment',
  // Do not extend the mark when typing at its boundary (same as links).
  inclusive: false,

  addOptions() {
    return {
      onCommentClick: null,
    };
  },

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML(element) {
          return element.getAttribute('data-comment-thread');
        },
        renderHTML(attributes) {
          if (!attributes.threadId) {
            return {};
          }

          return {
            'data-comment-thread': attributes.threadId,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment-thread]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'comment-mark' }),
      0,
    ];
  },

  addCommands() {
    return {
      setComment:
        (threadId) =>
        ({ commands }) =>
          commands.setMark(this.name, { threadId }),
      unsetComment:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },

  addProseMirrorPlugins() {
    const markName = this.name;
    const options = this.options;

    return [
      new Plugin({
        key: new PluginKey('commentMarkClick'),
        props: {
          handleClick: (view, pos) => {
            const { doc } = view.state;
            if (pos < 0 || pos > doc.content.size) {
              return false;
            }

            const mark = doc
              .resolve(pos)
              .marks()
              .find((m) => m.type.name === markName);

            if (mark && mark.attrs.threadId && options.onCommentClick) {
              options.onCommentClick(mark.attrs.threadId as string);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
