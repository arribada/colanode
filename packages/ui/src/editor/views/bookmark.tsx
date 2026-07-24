import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { ExternalLink, Globe } from 'lucide-react';
import { useState } from 'react';

export const BookmarkNodeView = ({
  node,
  editor,
  updateAttributes,
}: NodeViewProps) => {
  const url = (node.attrs.url as string) ?? '';
  const editable = editor.isEditable;
  const [draft, setDraft] = useState('');

  const normalize = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  const domain = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();

  if (!url) {
    if (!editable) {
      return (
        <NodeViewWrapper data-type="bookmark">
          <div className="my-1 rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
            Bookmark vide
          </div>
        </NodeViewWrapper>
      );
    }
    return (
      <NodeViewWrapper data-type="bookmark">
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
            placeholder="Collez un lien puis Entrée…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const next = normalize(draft);
                if (next) {
                  updateAttributes({ url: next });
                }
              }
            }}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-type="bookmark">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        contentEditable={false}
        onClick={(e) => {
          e.preventDefault();
          window.colanode.openExternalUrl(url);
        }}
        className="group my-1 flex cursor-pointer select-none items-center gap-3 rounded-md border border-border/60 bg-background p-3 no-underline transition-all hover:border-border hover:bg-accent hover:shadow-sm"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/50">
          <Globe className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {domain}
          </p>
          <p className="truncate text-xs text-muted-foreground">{url}</p>
        </div>
        <ExternalLink className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </a>
    </NodeViewWrapper>
  );
};
