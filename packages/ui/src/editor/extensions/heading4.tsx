import { mergeAttributes, Node, textblockTypeInputRule } from '@tiptap/core';

import { defaultClasses } from '@colanode/ui/editor/classes';

export interface Heading4Options {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    heading4: {
      /**
       * Set a heading4 node
       */
      setHeading4: () => ReturnType;
      /**
       * Toggle a heading4 node
       */
      toggleHeading4: () => ReturnType;
    };
  }
}

/**
 * This extension allows you to create h4 headings.
 */
export const Heading4Node = Node.create<Heading4Options>({
  name: 'heading4',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  content: 'inline*',

  group: 'block',

  defining: true,

  addAttributes() {
    return {
      collapsed: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) =>
          attributes.collapsed ? { 'data-collapsed': 'true' } : {},
        keepOnSplit: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'h4' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'h4',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: defaultClasses.heading4,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setHeading4:
        () =>
        ({ commands }) => {
          return commands.setNode(this.name);
        },
      toggleHeading4:
        () =>
        ({ commands }) => {
          return commands.toggleNode(this.name, 'paragraph');
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-4': () => this.editor.commands.toggleHeading4(),
    };
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^####\s$/,
        type: this.type,
      }),
    ];
  },
});
