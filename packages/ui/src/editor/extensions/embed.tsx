import { mergeAttributes, Node } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { EmbedNodeView } from '@colanode/ui/editor/views';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      /**
       * Insert an embed block for the given URL (empty prompts for one).
       */
      setEmbed: (url?: string, provider?: string) => ReturnType;
    };
  }
}

export type EmbedProvider =
  | 'google-docs'
  | 'google-sheets'
  | 'google-slides'
  | 'google-drive-file'
  | 'google-drive-folder'
  | 'youtube'
  | 'figma'
  | 'generic';

export interface EmbedInfo {
  provider: EmbedProvider;
  /** URL to load inside the <iframe> (provider-specific embeddable form). */
  embedUrl: string;
  /** Human label shown in the header bar. */
  label: string;
  /** Hostname used to fetch a favicon. */
  domain: string;
}

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const parse = (value: string): URL | null => {
  try {
    return new URL(normalizeUrl(value));
  } catch {
    return null;
  }
};

/**
 * Detect the provider for a raw URL and compute the URL that can safely be
 * loaded inside an <iframe>. Returns null when the value is not a usable
 * http(s) URL. Every recognized Google surface is rewritten to its
 * embed/preview variant; unknown https URLs fall back to a generic iframe.
 */
export const toEmbedInfo = (rawUrl: string): EmbedInfo | null => {
  const url = parse(rawUrl);
  if (!url) {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  const domain = url.hostname.replace(/^www\./, '');
  const href = url.href;

  // Google Docs / Sheets / Slides — docs.google.com/<kind>/d/<id>/edit...
  const gdocMatch = href.match(
    /docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([^/?#]+)/i
  );
  if (gdocMatch) {
    const kind = gdocMatch[1]!.toLowerCase();
    const id = gdocMatch[2]!;
    if (kind === 'document') {
      return {
        provider: 'google-docs',
        embedUrl: `https://docs.google.com/document/d/${id}/preview`,
        label: 'Google Docs',
        domain,
      };
    }
    if (kind === 'spreadsheets') {
      return {
        provider: 'google-sheets',
        embedUrl: `https://docs.google.com/spreadsheets/d/${id}/preview`,
        label: 'Google Sheets',
        domain,
      };
    }
    return {
      provider: 'google-slides',
      embedUrl: `https://docs.google.com/presentation/d/${id}/embed`,
      label: 'Google Slides',
      domain,
    };
  }

  // Google Drive file — drive.google.com/file/d/<id>/view...
  const gfileMatch = href.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (gfileMatch) {
    const id = gfileMatch[1]!;
    return {
      provider: 'google-drive-file',
      embedUrl: `https://drive.google.com/file/d/${id}/preview`,
      label: 'Google Drive',
      domain,
    };
  }

  // Google Drive folder — drive.google.com/drive/folders/<id>...
  const gfolderMatch = href.match(
    /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([^/?#]+)/i
  );
  if (gfolderMatch) {
    const id = gfolderMatch[1]!;
    return {
      provider: 'google-drive-folder',
      embedUrl: `https://drive.google.com/embeddedfolderview?id=${id}#grid`,
      label: 'Google Drive',
      domain,
    };
  }

  // Google Drive "open?id=" links (shared files).
  if (/drive\.google\.com\/open/i.test(href)) {
    const id = url.searchParams.get('id');
    if (id) {
      return {
        provider: 'google-drive-file',
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
        label: 'Google Drive',
        domain,
      };
    }
  }

  // YouTube — watch?v=<id> or youtu.be/<id>
  if (/youtube\.com\/watch/i.test(href)) {
    const id = url.searchParams.get('v');
    if (id) {
      return {
        provider: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${id}`,
        label: 'YouTube',
        domain,
      };
    }
  }
  const ytShort = href.match(/youtu\.be\/([^/?#]+)/i);
  if (ytShort) {
    return {
      provider: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytShort[1]}`,
      label: 'YouTube',
      domain,
    };
  }
  const ytEmbed = href.match(/youtube\.com\/embed\/([^/?#]+)/i);
  if (ytEmbed) {
    return {
      provider: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytEmbed[1]}`,
      label: 'YouTube',
      domain,
    };
  }

  // Figma — wrap the file/design URL in the official embed endpoint.
  if (/figma\.com\/(file|design|proto|board|slides)\//i.test(href)) {
    return {
      provider: 'figma',
      embedUrl: `https://www.figma.com/embed?embed_host=colanode&url=${encodeURIComponent(
        href
      )}`,
      label: 'Figma',
      domain,
    };
  }

  // Anything else: load the URL as-is in a generic iframe.
  return {
    provider: 'generic',
    embedUrl: href,
    label: domain,
    domain,
  };
};

/**
 * True when a bare, standalone URL should auto-convert into an embed block on
 * paste. Restricted to the high-signal providers (Google surfaces + YouTube +
 * Figma) so pasting an arbitrary link keeps its normal autolink behavior.
 */
export const isAutoEmbedUrl = (rawUrl: string): boolean => {
  const info = toEmbedInfo(rawUrl);
  if (!info) {
    return false;
  }
  return info.provider !== 'generic';
};

export const EmbedNode = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-url') ?? '',
        renderHTML: (attributes) =>
          attributes.url ? { 'data-url': attributes.url } : {},
      },
      provider: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-provider') ?? '',
        renderHTML: (attributes) =>
          attributes.provider ? { 'data-provider': attributes.provider } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'embed' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedNodeView);
  },

  addCommands() {
    return {
      setEmbed:
        (url = '', provider = '') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { url, provider },
          }),
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const type = this.name;

    return [
      new Plugin({
        key: new PluginKey('embedPaste'),
        props: {
          handlePaste(_, event) {
            // Only act on a bare URL pasted on its own — if the clipboard
            // carries HTML, it's a rich paste and should be left to the
            // normal handlers.
            const html = event.clipboardData?.getData('text/html');
            if (html) {
              return false;
            }

            const text = event.clipboardData?.getData('text/plain');
            if (!text) {
              return false;
            }

            const trimmed = text.trim();
            if (!isAutoEmbedUrl(trimmed)) {
              return false;
            }

            const info = toEmbedInfo(trimmed);
            if (!info) {
              return false;
            }

            editor
              .chain()
              .focus()
              .insertContent({
                type,
                attrs: { url: trimmed, provider: info.provider },
              })
              .run();

            return true;
          },
        },
      }),
    ];
  },
});
