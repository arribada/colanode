import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { MermaidNodeView } from '@colanode/ui/editor/views';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaid: {
      /**
       * Insert a Mermaid diagram block at the cursor
       */
      insertMermaid: () => ReturnType;
    };
  }
}

const DEFAULT_MERMAID_SOURCE = `graph TD
  A[Start] --> B{Ready?}
  B -- Yes --> C[Go]
  B -- No --> A`;

// A client-side Mermaid diagram. Like the math block the source lives in an
// attribute and the node is an atom (no editable ProseMirror content); the
// NodeView renders the diagram to SVG and offers an editable source panel.
//
// CRITICAL: renderHTML + parseHTML must exist. The editor runs with
// immediatelyRender:true, so ProseMirror serializes every node via toDOM
// synchronously on the first render — a node without renderHTML throws and
// crashes the whole page ("Node error"). The `id` attribute is defined locally
// (mermaid is intentionally NOT in the IdExtension global-attribute list, so
// no core change is needed) so the id plugin can still assign a stable block
// id that round-trips through the block store.
export const MermaidNode = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
      },
      source: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-source') ?? '',
        renderHTML: (attributes) => ({
          'data-source': (attributes.source as string | null) ?? '',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'mermaid' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },

  addCommands() {
    return {
      insertMermaid:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { source: DEFAULT_MERMAID_SOURCE },
          });
        },
    };
  },
});
