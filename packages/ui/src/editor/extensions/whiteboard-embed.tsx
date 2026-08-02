import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { WhiteboardEmbedNodeView } from '@colanode/ui/editor/views';

// A block-level, atomic node that embeds an EXISTING whiteboard into a page as
// a fixed-height, READ-ONLY preview. `id` is the referenced whiteboard node id
// and `height` its display height in pixels. See `WhiteboardEmbedNodeView`.
//
// CRITICAL: like `planeEmbed`/`embed`/`bookmark`, this node defines BOTH
// `parseHTML` and `renderHTML`. The editor runs with `immediatelyRender: true`,
// so ProseMirror serializes nodes via their `toDOM` spec synchronously on first
// render; a block node WITHOUT `renderHTML` crashes the whole page ("Node
// error"). Do not remove them.
export const WhiteboardEmbedNode = Node.create({
  name: 'whiteboardEmbed',
  group: 'block',
  atom: true,
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-id') ?? null,
        renderHTML: (attributes) =>
          attributes.id ? { 'data-id': attributes.id } : {},
      },
      height: {
        default: 480,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-height');
          const value = raw ? Number(raw) : NaN;
          return Number.isFinite(value) ? value : 480;
        },
        renderHTML: (attributes) => ({ 'data-height': attributes.height }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="whiteboard-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'whiteboard-embed' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WhiteboardEmbedNodeView);
  },
});
