import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { BookmarkNodeView } from '@colanode/ui/editor/views';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bookmark: {
      /**
       * Insert a bookmark block for the given URL (empty prompts for one).
       */
      setBookmark: (url?: string) => ReturnType;
    };
  }
}

export const BookmarkNode = Node.create({
  name: 'bookmark',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-url') ?? '',
        renderHTML: (attributes) =>
          attributes.url ? { 'data-url': attributes.url } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="bookmark"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'bookmark' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkNodeView);
  },

  addCommands() {
    return {
      setBookmark:
        (url = '') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { url } }),
    };
  },
});
