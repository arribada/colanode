// ABOUTME: Off-screen renderer that mounts each page's Document within the app
// ABOUTME: providers, waits for it to fully render, then hands back its HTML.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { LocalNode } from '@colanode/client/types';
import { Document } from '@colanode/ui/components/documents/document';
import { getDocumentExporter } from '@colanode/ui/lib/document-export';

// Content width the hidden pages lay out at, matching the print column so wide
// tables/embeds overflow measurably here and can be tagged for landscape.
const PRINT_WIDTH = 820;

export interface RenderedPage {
  id: string;
  title: string;
  html: string;
}

interface PrintRendererProps {
  pages: LocalNode[];
  onReady: (rendered: RenderedPage[]) => void;
}

// Tag tables / database embeds that are wider than the page so the assembled
// document can drop them onto a landscape page.
const markWideElements = (container: HTMLElement) => {
  container
    .querySelectorAll('table, [data-id], .overflow-auto, .overflow-x-auto')
    .forEach((el) => {
      const he = el as HTMLElement;
      if (he.scrollWidth > he.clientWidth + 4 || he.scrollWidth > PRINT_WIDTH) {
        he.classList.add('print-landscape');
      }
    });
};

export const PrintRenderer = ({ pages, onReady }: PrintRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();
    const ids = pages.map((p) => p.id);

    const finish = () => {
      if (cancelled) {
        return;
      }
      const container = containerRef.current;
      if (container) {
        try {
          markWideElements(container);
        } catch {
          // ignore measurement failures — export still works, just portrait
        }
      }
      const rendered = pages.map((p) => ({
        id: p.id,
        title: (('name' in p && p.name) || 'Untitled') as string,
        html: getDocumentExporter(p.id)?.getRenderedHtml() ?? '',
      }));
      onReady(rendered);
    };

    const tick = () => {
      if (cancelled) {
        return;
      }
      // Wait until each page's editor has actually LOADED its content (not just
      // registered an empty exporter) — otherwise the off-screen editor is
      // captured before its document renders and the PDF body comes out blank.
      // A genuinely empty page never satisfies this and falls through to the
      // timeout below (then exports empty, which is correct).
      const allReady = ids.every((id) => {
        const exporter = getDocumentExporter(id);
        if (!exporter) {
          return false;
        }
        try {
          return exporter.getMarkdown().trim().length > 0;
        } catch {
          return false;
        }
      });
      const elapsed = Date.now() - start;
      if (allReady || elapsed > 8000) {
        // Let async content (mermaid / KaTeX / database embeds) settle.
        window.setTimeout(finish, 1000);
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
        width: PRINT_WIDTH,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      {pages.map((page) => (
        <div key={page.id} style={{ width: PRINT_WIDTH }}>
          <Document node={page} canEdit={false} />
        </div>
      ))}
    </div>,
    document.body
  );
};
