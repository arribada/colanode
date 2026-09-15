// Print an arbitrary HTML fragment (or serialized SVG) as its own isolated
// document via a hidden iframe, so the browser's native "Save as PDF" flow
// produces a clean page free of the app chrome (sidebar, toolbars, menus).
// DOM-only, so it lives outside the unit-tested pure helpers.
import { getThemeVariables } from '@colanode/ui/lib/themes';

interface PrintOptions {
  title: string;
  bodyHtml: string;
  // Extra CSS appended to the print document <head>.
  css?: string;
  // Carry the app's own stylesheets and its light theme into the print
  // document, so blocks print the way they look on screen -- callout colours,
  // dividers, badges -- instead of as unstyled markup.
  withAppStyles?: boolean;
  // Runs inside the print document once its styles, fonts and images have
  // loaded and before the dialog opens: the one moment real layout can be
  // measured.
  beforePrint?: (doc: Document) => void;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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

// Wait for something that may never arrive -- a stylesheet that fails, an image
// that never loads -- without ever holding the print dialog back for long.
const settle = (promise: Promise<unknown>, ms: number): Promise<unknown> =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);

const whenLoaded = (el: HTMLLinkElement | HTMLImageElement): Promise<void> =>
  new Promise((resolve) => {
    el.addEventListener('load', () => resolve(), { once: true });
    el.addEventListener('error', () => resolve(), { once: true });
  });

const appStylesHtml = (): string =>
  Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML)
    .join('');

// The app applies its theme variables to <html> from script, which the print
// document never runs; without them every themed colour resolves to nothing.
const lightThemeStyle = (): string =>
  Object.entries(getThemeVariables('light', undefined))
    .map(([name, value]) => `${name}:${value}`)
    .join(';');

export const printHtmlDocument = ({
  title,
  bodyHtml,
  css,
  withAppStyles = false,
  beforePrint,
}: PrintOptions): void => {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  // Laid out off-screen at a real A4 width instead of collapsed to 0x0, so the
  // document can be measured before it is printed.
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '794px';
  iframe.style.height = '1123px';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }

  const rootStyle = withAppStyles
    ? ` style="${escapeHtml(lightThemeStyle())}"`
    : '';

  doc.open();
  doc.write(
    '<!doctype html><html' +
      rootStyle +
      '><head><meta charset="utf-8"><title>' +
      escapeHtml(title) +
      '</title>' +
      (withAppStyles ? appStylesHtml() : '') +
      '<style>' +
      BASE_CSS +
      (css ?? '') +
      '</style></head><body><div class="print-root">' +
      bodyHtml +
      '</div></body></html>'
  );
  doc.close();

  const prepare = async () => {
    const links = Array.from(
      doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    ).filter((link) => !link.sheet);
    await settle(Promise.all(links.map(whenLoaded)), 5000);
    await settle(doc.fonts?.ready ?? Promise.resolve(), 3000);
    const images = Array.from(doc.images).filter((img) => !img.complete);
    await settle(Promise.all(images.map(whenLoaded)), 8000);

    if (beforePrint) {
      try {
        beforePrint(doc);
      } catch (error) {
        // A failed measurement must not cost the export: print it as laid out.
        console.warn('[print] layout pass failed, printing as is', error);
      }
    }
  };

  const trigger = () => {
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      return;
    }
    // Chrome names the saved PDF after the page that opened the dialog, not
    // after this iframe, so the top document carries the title while it is open.
    const previousTitle = document.title;
    document.title = title;
    try {
      win.focus();
      win.print();
    } finally {
      document.title = previousTitle;
      // Give the (modal) print dialog time to grab the document before the
      // iframe is torn down.
      setTimeout(() => iframe.remove(), 1500);
    }
  };

  // Let the document parse before looking for what it still has to load.
  setTimeout(() => {
    void prepare().then(trigger, trigger);
  }, 50);
};
