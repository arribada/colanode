// Print an arbitrary HTML fragment (or serialized SVG) as its own isolated
// document via a hidden iframe, so the browser's native "Save as PDF" flow
// produces a clean page free of the app chrome (sidebar, toolbars, menus).
// DOM-only, so it lives outside the unit-tested pure helpers.

interface PrintOptions {
  title: string;
  bodyHtml: string;
  // Extra CSS appended to the print document <head>.
  css?: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color: #111827;
    background: #ffffff;
    line-height: 1.6;
  }
  .print-root { padding: 8px 4px; max-width: 860px; margin: 0 auto; }
  img, svg, canvas { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #9ca3af; padding: 6px 10px; text-align: left; }
  th { background: #f3f4f6; }
  pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre { white-space: pre-wrap; word-wrap: break-word; background: #f3f4f6; padding: 10px; border-radius: 6px; }
  blockquote { margin: 0; padding-left: 12px; border-left: 3px solid #d1d5db; color: #4b5563; }
  h1, h2, h3 { line-height: 1.25; }
  a { color: #2563eb; }
  /* strip live-editor affordances that leak into innerHTML */
  .board-no-export, [data-remote-caret], .ProseMirror-gapcursor { display: none !important; }
  @page { margin: 16mm; }
`;

export const printHtmlDocument = ({
  title,
  bodyHtml,
  css,
}: PrintOptions): void => {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>' +
      escapeHtml(title) +
      '</title><style>' +
      BASE_CSS +
      (css ?? '') +
      '</style></head><body><div class="print-root">' +
      bodyHtml +
      '</div></body></html>'
  );
  doc.close();

  const trigger = () => {
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      return;
    }
    try {
      win.focus();
      win.print();
    } finally {
      // Give the (modal) print dialog time to grab the document before the
      // iframe is torn down.
      setTimeout(() => iframe.remove(), 1500);
    }
  };

  // Let images / fonts / SVG settle before printing.
  setTimeout(trigger, 350);
};
