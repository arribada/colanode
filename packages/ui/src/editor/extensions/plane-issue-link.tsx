import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { parsePlaneIssueUrl } from '@colanode/core';
import { PlaneIssueLinkNodeView } from '@colanode/ui/editor/views';

// Recognizes a pasted Plane issue URL
// (https://plane.arribada.org/<workspace>/projects/<projectId>/issues/<issueId>)
// and turns it into a `planeIssueLink` atom node that renders a live chip
// (identifier + title + state), fetched through the server-side proxy — see
// `PlaneIssueLinkNodeView` / the `plane.issue.get` query.
//
// Only fires when the ENTIRE clipboard payload is a single Plane issue URL
// with no accompanying HTML — a link pasted as part of a larger block of
// text is left alone (handled as a normal autolink by `LinkMark` /
// `ParserExtension` instead). Register this extension BEFORE
// `ParserExtension` in the editor's extension list so this more specific
// paste rule gets first refusal.
export const PlaneIssueLinkExtension = Node.create({
  name: 'planeIssueLink',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,
  addAttributes() {
    return {
      url: {
        default: null,
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="plane-issue-link"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'plane-issue-link' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PlaneIssueLinkNodeView, {
      as: 'span',
      className: 'inline-flex',
    });
  },
  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('planeIssueLinkPaste'),
        props: {
          handlePaste(_, event) {
            const html = event.clipboardData?.getData('text/html');
            if (html) {
              return false;
            }

            const text = event.clipboardData?.getData('text/plain');
            if (!text) {
              return false;
            }

            const parts = parsePlaneIssueUrl(text);
            if (!parts) {
              return false;
            }

            editor
              .chain()
              .focus()
              .insertContent({
                type: 'planeIssueLink',
                attrs: { url: text.trim() },
              })
              .run();

            return true;
          },
        },
      }),
    ];
  },
});
