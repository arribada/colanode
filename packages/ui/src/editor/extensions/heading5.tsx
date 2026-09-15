import { mergeAttributes, Node, textblockTypeInputRule } from '@tiptap/core';

import { defaultClasses } from '@colanode/ui/editor/classes';

export interface Heading5Options {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    heading5: {
      /**
       * Set a heading5 node
       */
      setHeading5: () => ReturnType;
      /**
       * Toggle a heading5 node
       */
      toggleHeading5: () => ReturnType;
    };
  }
}

/**
 * This extension allows you to create h5 headings.
 */
export const Heading5Node = Node.create<Heading5Options>({
  name: 'heading5',

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
    return [{ tag: 'h5' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'h5',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: defaultClasses.heading5,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setHeading5:
        () =>
        ({ commands }) => {
          return commands.setNode(this.name);
        },
      toggleHeading5:
        () =>
        ({ commands }) => {
          return commands.toggleNode(this.name, 'paragraph');
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-5': () => this.editor.commands.toggleHeading5(),
    };
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^#####\s$/,
        type: this.type,
      }),
    ];
  },
});
