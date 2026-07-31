import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { ExternalLink, Globe } from 'lucide-react';
import { useState } from 'react';

import { toEmbedInfo } from '@colanode/ui/editor/extensions/embed';

export const EmbedNodeView = ({
  node,
  editor,
  updateAttributes,
}: NodeViewProps) => {
  const url = (node.attrs.url as string) ?? '';
  const editable = editor.isEditable;
  const [draft, setDraft] = useState('');
  const [iconFailed, setIconFailed] = useState(false);

  const info = url ? toEmbedInfo(url) : null;

  const faviconUrl = info
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        info.domain
      )}&sz=64`
    : '';

  const commit = (value: string) => {
    const parsed = toEmbedInfo(value);
    if (!parsed) {
      return;
    }
    updateAttributes({ url: value.trim(), provider: parsed.provider });
  };

  // Empty state — prompt for a URL, exactly like the bookmark block.
  if (!url || !info) {
    if (!editable) {
      return (
        <NodeViewWrapper data-type="embed">
          <div className="my-1 rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
            Embed vide
          </div>
        </NodeViewWrapper>
      );
    }
    return (
      <NodeViewWrapper data-type="embed">
        <div
          contentEditable={false}
          className="my-1 flex select-none items-center gap-2 rounded-md border border-border/60 bg-muted/30 p-2"
        >
          <Globe className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="url"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the block is inserted on demand and should accept the URL immediately
            autoFocus
            value={draft}
            placeholder="Collez un lien Google Drive / Docs / YouTube… puis Entrée"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit(draft);
              }
            }}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-type="embed">
      <div
        contentEditable={false}
        className="my-2 select-none overflow-hidden rounded-md border border-border/60 bg-background"
      >
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
          <div className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded">
            {faviconUrl && !iconFailed ? (
              <img
                src={faviconUrl}
                alt=""
                width={16}
                height={16}
                className="size-4"
                loading="lazy"
                onError={() => setIconFailed(true)}
              />
            ) : (
              <Globe className="size-4 text-muted-foreground" />
            )}
          </div>
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {info.label}
          </p>
          <button
            type="button"
            title="Ouvrir dans un nouvel onglet"
            onClick={() => window.colanode.openExternalUrl(url)}
            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </button>
        </div>
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={info.embedUrl}
            title={info.label}
            allow="fullscreen; clipboard-write; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 size-full border-0"
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
};
