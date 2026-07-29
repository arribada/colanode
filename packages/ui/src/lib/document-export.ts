// A tiny module-level registry that lets the page ⋯ menu (which lives in the
// node header — a different React subtree from the editor body) export the
// CURRENTLY open document. The DocumentEditor registers a pair of getters for
// its node id while it is mounted; the menu reads them. Purely client-side,
// no persistence and no core/schema change.

export interface DocumentExporter {
  // Serialize the live editor content to Markdown.
  getMarkdown: () => string;
  // The fully rendered editor DOM (KaTeX / Mermaid SVG, tables, images…),
  // used for a clean print / PDF export.
  getRenderedHtml: () => string;
}

const registry = new Map<string, DocumentExporter>();

export const registerDocumentExporter = (
  nodeId: string,
  exporter: DocumentExporter
): (() => void) => {
  registry.set(nodeId, exporter);
  return () => {
    if (registry.get(nodeId) === exporter) {
      registry.delete(nodeId);
    }
  };
};

export const getDocumentExporter = (
  nodeId: string
): DocumentExporter | null => registry.get(nodeId) ?? null;

/** Download a string as a file. */
export const downloadTextFile = (
  text: string,
  filename: string,
  mime = 'text/plain'
): void => {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Turn a page/board name into a filesystem-safe file base name. */
export const safeFileName = (name: string | null | undefined): string => {
  const cleaned = (name ?? '').replace(/[\\/:*?"<>|\n\r\t]+/g, '_').trim();
  return cleaned.length > 0 ? cleaned : 'document';
};
