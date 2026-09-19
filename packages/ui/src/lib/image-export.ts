// ABOUTME: Turns an image URL or an SVG string into a PNG and puts it on the
// ABOUTME: system clipboard, so pictures and diagrams paste into other apps.

// Browsers only accept image/png on the async clipboard, so every picture is
// redrawn to PNG first, whatever its original format.

// Largest side of an exported PNG: big enough for a crisp diagram, small enough
// to stay under canvas size limits on every browser.
const MAX_EXPORT_SIDE = 4096;

export interface ExportSize {
  width: number;
  height: number;
}

const positive = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

// The pixel size to draw an SVG at: its viewBox (or width/height attributes
// when they are plain numbers), times `scale`, shrunk to fit MAX_EXPORT_SIDE.
export const svgExportSize = (svg: string, scale = 2): ExportSize | null => {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0];
  if (!root) {
    return null;
  }
  let width = NaN;
  let height = NaN;
  const viewBox = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(root)?.[1];
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4) {
      width = parts[2]!;
      height = parts[3]!;
    }
  }
  if (!positive(width) || !positive(height)) {
    width = Number(/\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(root)?.[1]);
    height = Number(/\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(root)?.[1]);
  }
  if (!positive(width) || !positive(height)) {
    return null;
  }
  const fit = Math.min(scale, MAX_EXPORT_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * fit)),
    height: Math.max(1, Math.round(height * fit)),
  };
};

// Mermaid writes width="100%" and a max-width style on its root, and an SVG
// without a pixel size may not draw at all as an image (Firefox refuses). The
// root gets the export size instead; the viewBox scales the drawing to it.
export const withPixelSize = (svg: string, size: ExportSize): string =>
  svg.replace(/<svg\b[^>]*>/i, (root) => {
    const bare = root
      .replace(/\s(width|height|style)\s*=\s*("[^"]*"|'[^']*')/gi, '')
      .replace(/\s*\/?>$/, '');
    return `${bare} width="${size.width}" height="${size.height}"${root.endsWith('/>') ? '/>' : '>'}`;
  });

// Mermaid draws flowchart labels as HTML inside <foreignObject>, and a canvas
// that has drawn one refuses to export. For a copy the diagram is rendered
// again with plain SVG text labels and a concrete font.
export const mermaidExportSource = (source: string): string =>
  `%%{init: {"htmlLabels": false, "flowchart": {"htmlLabels": false}, "fontFamily": "Arial, Helvetica, sans-serif"}}%%\n${source.trim()}`;

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be loaded'));
    image.src = url;
  });

const drawToPng = (
  image: HTMLImageElement,
  size: ExportSize,
  background: string | null
): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    return Promise.reject(new Error('Canvas is not available'));
  }
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, size.width, size.height);
  }
  context.drawImage(image, 0, 0, size.width, size.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('The image could not be encoded')),
      'image/png'
    )
  );
};

export const imageUrlToPng = async (url: string): Promise<Blob> => {
  const image = await loadImage(url);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!positive(width) || !positive(height)) {
    throw new Error('The image has no size');
  }
  return drawToPng(image, { width, height }, null);
};

export const svgToPng = async (svg: string, scale = 2): Promise<Blob> => {
  const size = svgExportSize(svg, scale);
  if (!size) {
    throw new Error('The diagram has no size');
  }
  const url = URL.createObjectURL(
    new Blob([withPixelSize(svg, size)], {
      type: 'image/svg+xml;charset=utf-8',
    })
  );
  try {
    // Diagrams are drawn on white in the page, so they are copied on white.
    return await drawToPng(await loadImage(url), size, '#ffffff');
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const canCopyImages = (): boolean =>
  typeof navigator !== 'undefined' &&
  typeof navigator.clipboard?.write === 'function' &&
  typeof ClipboardItem !== 'undefined';

// The PNG is handed over as a promise: Safari only allows the clipboard write
// if it starts inside the click, before any await.
export const copyPngToClipboard = (png: Promise<Blob>): Promise<void> =>
  navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
