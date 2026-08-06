// ABOUTME: A read-only, workspace-free `file` node for the public share editor —
// ABOUTME: renders an <img> (falling back to a download link) pointed at the
// ABOUTME: public /share-api/:token/files/:fileId endpoint. No client/services.
import { mergeAttributes, Node, NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useState } from 'react';

export interface PublicFileOptions {
  token: string;
  imageKey: string | null;
}

const fileUrl = (token: string, id: string, imageKey: string | null) => {
  const base = `/share-api/${encodeURIComponent(token)}/files/${encodeURIComponent(id)}`;
  // Password-protected shares gate file bytes behind a key handed out by
  // /unlock (see getShareImageKey on the server); a bare <img> carries it here.
  return imageKey ? `${base}?k=${encodeURIComponent(imageKey)}` : base;
};

const PublicFileView = ({ node, extension }: NodeViewProps) => {
  const id = node.attrs.id as string | null;
  const { token, imageKey } = extension.options as PublicFileOptions;
  const [failed, setFailed] = useState(false);

  if (!id || !token) {
    return null;
  }

  const url = fileUrl(token, id, imageKey);

  return (
    <NodeViewWrapper className="my-3">
      {failed ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent"
        >
          Download attachment
        </a>
      ) : (
        // The bytes come from our own same-origin, subtree-scoped endpoint; it
        // is served as an image (or fails to load, triggering the link above).
        <img
          src={url}
          alt=""
          loading="lazy"
          className="max-w-full rounded-md"
          onError={() => setFailed(true)}
        />
      )}
    </NodeViewWrapper>
  );
};

export const PublicFileNode = Node.create<PublicFileOptions>({
  name: 'file',
  group: 'block',
  atom: true,
  draggable: false,
  addOptions() {
    return { token: '', imageKey: null };
  },
  addAttributes() {
    return {
      id: {
        default: null,
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ['file', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PublicFileView, {
      as: 'file',
    });
  },
});
