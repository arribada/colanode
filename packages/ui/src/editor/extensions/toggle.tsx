import { mergeAttributes, Node } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { ToggleSummaryNodeView } from '@colanode/ui/editor/views/toggle-summary';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toggle: {
      /**
       * Wrap the current block into a toggle (details/summary) block
       */
      setToggle: () => ReturnType;
    };
  }
}

const chevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

export const ToggleNode = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'toggleSummary toggleContent',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-open') !== 'false',
        renderHTML: (attributes) => ({
          'data-open': attributes.open ? 'true' : 'false',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }, { tag: 'details' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggle',
        class: defaultClasses.toggle,
      }),
      0,
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.setAttribute('data-type', 'toggle');
      dom.setAttribute('data-open', node.attrs.open ? 'true' : 'false');
      dom.className = defaultClasses.toggle;

      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-toggle-button', 'true');
      button.setAttribute('aria-label', 'Toggle');
      button.contentEditable = 'false';
      button.className = defaultClasses.toggleButton;
      button.innerHTML = chevronSvg;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) {
          return;
        }

        const current = editor.state.doc.nodeAt(pos);
        if (!current || current.type.name !== this.name) {
          return;
        }

        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...current.attrs,
            open: !current.attrs.open,
          })
        );
      });

      const contentDOM = document.createElement('div');
      contentDOM.className = defaultClasses.toggleInner;

      dom.append(button, contentDOM);

      return {
        dom,
        contentDOM,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) {
            return false;
          }

          dom.setAttribute(
            'data-open',
            updatedNode.attrs.open ? 'true' : 'false'
          );
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      setToggle:
        () =>
        ({ state, dispatch }) => {
          const { schema } = state;
          const { $from } = state.selection;

          const block = $from.node($from.depth);
          if (!block.isTextblock) {
            return false;
          }

          const toggleType = schema.nodes[this.name];
          const summaryType = schema.nodes.toggleSummary;
          const contentType = schema.nodes.toggleContent;
          const paragraphType = schema.nodes.paragraph;
          if (!toggleType || !summaryType || !contentType || !paragraphType) {
            return false;
          }

          try {
            const summary = summaryType.create(null, block.content);
            const content = contentType.create(null, paragraphType.create());
            const toggle = toggleType.create({ open: true }, [
              summary,
              content,
            ]);

            const start = $from.before($from.depth);
            const end = $from.after($from.depth);

            const tr = state.tr.replaceWith(start, end, toggle);
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

export const ToggleSummaryNode = Node.create({
  name: 'toggleSummary',
  content: 'inline*',
  defining: true,
  selectable: false,
  isolating: true,

  addAttributes() {
    return {
      // 0 = normal text, 1/2/3 = heading sizes for the toggle's header line.
      level: {
        default: 0,
        parseHTML: (el) => {
          const l = parseInt(el.getAttribute('data-level') ?? '0', 10);
          return [1, 2, 3].includes(l) ? l : 0;
        },
        renderHTML: (attrs) =>
          attrs.level ? { 'data-level': String(attrs.level) } : {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleSummaryNodeView);
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle-summary"]' }, { tag: 'summary' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggle-summary',
        class: defaultClasses.toggleSummary,
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Enter inside the summary moves the cursor to the first block of the
      // toggle content (opening the toggle if it is collapsed).
      Enter: () => {
        const { state, view } = this.editor;
        const { $from, empty } = state.selection;

        if (!empty || $from.parent.type.name !== this.name) {
          return false;
        }

        const toggle = $from.node(-1);
        if (toggle.type.name !== 'toggle') {
          return false;
        }

        const togglePos = $from.before(-1);
        const summary = toggle.child(0);

        const tr = state.tr;
        if (!toggle.attrs.open) {
          tr.setNodeMarkup(togglePos, undefined, {
            ...toggle.attrs,
            open: true,
          });
        }

        // toggle start + 1 => summary, + summary.nodeSize => toggleContent,
        // + 1 => first block, + 1 => inside the first block.
        const contentStart = togglePos + 1 + summary.nodeSize + 2;
        tr.setSelection(TextSelection.create(tr.doc, contentStart));
        view.dispatch(tr.scrollIntoView());
        return true;
      },
      // Backspace at the start of the summary unwraps the toggle back into
      // regular blocks.
      Backspace: () => {
        const { state, view } = this.editor;
        const { $from, empty } = state.selection;

        if (
          !empty ||
          $from.parent.type.name !== this.name ||
          $from.parentOffset !== 0
        ) {
          return false;
        }

        const toggle = $from.node(-1);
        if (toggle.type.name !== 'toggle') {
          return false;
        }

        const paragraphType = state.schema.nodes.paragraph;
        if (!paragraphType) {
          return false;
        }

        const togglePos = $from.before(-1);
        const summaryParagraph = paragraphType.create(
          null,
          toggle.child(0).content
        );
        const contentBlocks: ProseMirrorNode[] = [];
        toggle.child(1).forEach((child) => {
          contentBlocks.push(child);
        });

        const tr = state.tr.replaceWith(
          togglePos,
          togglePos + toggle.nodeSize,
          [summaryParagraph, ...contentBlocks]
        );
        tr.setSelection(TextSelection.create(tr.doc, togglePos + 1));
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
});

export const ToggleContentNode = Node.create({
  name: 'toggleContent',
  content: 'block+',
  defining: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-type="toggle-content"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggle-content',
        class: defaultClasses.toggleContent,
      }),
      0,
    ];
  },
});
