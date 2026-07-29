import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { PlaneEmbedNodeView } from '@colanode/ui/editor/views';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    planeEmbed: {
      /**
       * Insert a Plane project embed block. An empty projectId makes the
       * block render an in-place project picker instead of the link hub.
       */
      setPlaneEmbed: (projectId?: string) => ReturnType;
    };
  }
}

// A block-level, atomic node that renders a compact, READ-ONLY link hub for a
// Plane project inside a wiki page — the project name plus its issues as
// clickable links that open in Plane (new tab). See `PlaneEmbedNodeView`.
// Data is fetched through the server-side proxy (`plane.project.board` query),
// which is strictly read-only (GET/list only) so the Plane API token never
// reaches the client and nothing here can ever write back to Plane.
//
// CRITICAL: like `embed`/`bookmark`, this node defines `parseHTML` +
// `renderHTML`. The editor runs with `immediatelyRender: true`, so ProseMirror
// serializes nodes via their `toDOM` spec synchronously on first render; a
// node WITHOUT `renderHTML` crashes the whole page ("Node error"). Do not
// remove them.
export const PlaneEmbedNode = Node.create({
  name: 'planeEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      projectId: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-project-id') ?? null,
        renderHTML: (attributes) =>
          attributes.projectId
            ? { 'data-project-id': attributes.projectId }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="plane-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'plane-embed' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PlaneEmbedNodeView);
  },

  addCommands() {
    return {
      setPlaneEmbed:
        (projectId = '') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { projectId: projectId || null },
          }),
    };
  },
});
