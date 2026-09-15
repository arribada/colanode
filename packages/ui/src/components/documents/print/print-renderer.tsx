// ABOUTME: Off-screen renderer that mounts each page's Document within the app
// ABOUTME: providers, waits for it to fully render, then hands back its HTML.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { LocalNode } from '@colanode/client/types';
import { Document } from '@colanode/ui/components/documents/document';
import { getDocumentExporter } from '@colanode/ui/lib/document-export';

// Hidden pages lay out at the editor column's width (max-w-3xl), so an image an
// author resized keeps the width the export scales from. Measuring for the
// page is done later, in the print document itself.
const RENDER_WIDTH = 768;

export interface RenderedPage {
  id: string;
  title: string;
  html: string;
}

interface PrintRendererProps {
  pages: LocalNode[];
  onReady: (rendered: RenderedPage[]) => void;
}

const hasContent = (id: string): boolean => {
  const exporter = getDocumentExporter(id);
  if (!exporter) {
    return false;
  }
  try {
    return exporter.getMarkdown().trim().length > 0;
  } catch {
    return false;
  }
};

// A caption field keeps its text in the value PROPERTY, which innerHTML never
// serializes. Mirror it into the attribute so the exported copy still has it.
const mirrorFieldValues = () => {
  document
    .querySelectorAll<HTMLInputElement>('figcaption input')
    .forEach((input) => input.setAttribute('value', input.value));
};

export const PrintRenderer = ({ pages, onReady }: PrintRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Snapshot the HTML of any page whose editor is ALREADY mounted and loaded
  // (the page the user is looking at). This happens on the very first render,
  // before the off-screen <Document> copies below register (and overwrite) the
  // exporter with an empty second editor — two editors on the same node's synced
  // doc don't both load, which is why exporting the open page came out blank.
  // Pre-captured pages then skip the off-screen mount entirely.
  const preloadedRef = useRef<Map<string, string> | null>(null);
  if (preloadedRef.current === null) {
    const map = new Map<string, string>();
    mirrorFieldValues();
    for (const page of pages) {
      if (hasContent(page.id)) {
        const html = getDocumentExporter(page.id)?.getRenderedHtml() ?? '';
        if (html.trim().length > 0) {
          map.set(page.id, html);
        }
      }
    }
    preloadedRef.current = map;
  }
  const preloaded = preloadedRef.current;
  const pendingPages = pages.filter((p) => !preloaded.has(p.id));

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();
    const pendingIds = pendingPages.map((p) => p.id);

    const finish = () => {
      if (cancelled) {
        return;
      }
      mirrorFieldValues();
      const rendered = pages.map((p) => ({
        id: p.id,
        title: (('name' in p && p.name) || 'Untitled') as string,
        html:
          preloaded.get(p.id) ??
          getDocumentExporter(p.id)?.getRenderedHtml() ??
          '',
      }));
      onReady(rendered);
    };

    const tick = () => {
      if (cancelled) {
        return;
      }
      // Only the OFF-SCREEN (pending) pages need to load; pre-captured ones are
      // already in hand. A genuinely empty page never satisfies hasContent and
      // falls through to the timeout, then exports empty (correct).
      const allReady = pendingIds.every((id) => hasContent(id));
      const elapsed = Date.now() - start;
      if (pendingIds.length === 0 || allReady || elapsed > 8000) {
        // Let async content (mermaid / KaTeX / database embeds) settle.
        window.setTimeout(finish, pendingIds.length === 0 ? 0 : 1000);
      } else {
        window.setTimeout(tick, 200);
      }
    };

    // First paint needs a beat before any exporter registers.
    window.setTimeout(tick, 300);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  return createPortal(
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: -100000,
        top: 0,
        width: RENDER_WIDTH,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      {pendingPages.map((page) => (
        <div key={page.id} style={{ width: RENDER_WIDTH }}>
          <Document node={page} canEdit={false} />
        </div>
      ))}
    </div>,
    document.body
  );
};
