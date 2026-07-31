// Export a board region to a PNG. Serializes an SVG scene group, rasterizes it
// through an <img> + <canvas>, and returns / downloads a PNG blob. DOM-only, so
// it lives outside the unit-tested pure helpers.

import { Rect } from '@colanode/ui/lib/board/geometry';

const XMLNS = 'http://www.w3.org/2000/svg';

/** Rasterize an SVG markup string to a PNG blob. */
export const svgStringToPng = (
  svgString: string,
  width: number,
  height: number,
  scale = 2,
  background = '#ffffff'
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas toBlob failed'));
        }
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Failed to rasterize SVG'));
    img.src =
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  });

/**
 * Export a scene <g> (elements in scene coordinates) clipped to `region`.
 * Any node carrying the `board-no-export` class is stripped (grid, selection,
 * handles, marquee) and the group's pan/zoom transform is reset to identity.
 */
export const exportScenePng = async (
  sceneGroup: SVGGElement,
  region: Rect,
  options: { scale?: number; background?: string } = {}
): Promise<Blob> => {
  const clone = sceneGroup.cloneNode(true) as SVGGElement;
  clone.removeAttribute('transform');
  clone.querySelectorAll('.board-no-export').forEach((n) => n.remove());

  const svg = document.createElementNS(XMLNS, 'svg');
  svg.setAttribute('xmlns', XMLNS);
  svg.setAttribute('width', String(region.w));
  svg.setAttribute('height', String(region.h));
  svg.setAttribute(
    'viewBox',
    `${region.x} ${region.y} ${region.w} ${region.h}`
  );
  svg.appendChild(clone);

  const serialized = new XMLSerializer().serializeToString(svg);
  return svgStringToPng(
    serialized,
    region.w,
    region.h,
    options.scale ?? 2,
    options.background ?? '#ffffff'
  );
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Serialize a scene <g> region to a standalone SVG string. Mirrors the PNG
 * clone/strip logic but embeds a background <rect> (SVG has no canvas fill) so
 * the exported file is opaque. Any `board-no-export` node (grid, selection,
 * handles) is removed and the pan/zoom transform reset to identity.
 */
export const buildSceneSvgString = (
  sceneGroup: SVGGElement,
  region: Rect,
  background = '#ffffff'
): string => {
  const clone = sceneGroup.cloneNode(true) as SVGGElement;
  clone.removeAttribute('transform');
  clone.querySelectorAll('.board-no-export').forEach((n) => n.remove());

  const svg = document.createElementNS(XMLNS, 'svg');
  svg.setAttribute('xmlns', XMLNS);
  svg.setAttribute('width', String(region.w));
  svg.setAttribute('height', String(region.h));
  svg.setAttribute(
    'viewBox',
    `${region.x} ${region.y} ${region.w} ${region.h}`
  );

  if (background) {
    const bg = document.createElementNS(XMLNS, 'rect');
    bg.setAttribute('x', String(region.x));
    bg.setAttribute('y', String(region.y));
    bg.setAttribute('width', String(region.w));
    bg.setAttribute('height', String(region.h));
    bg.setAttribute('fill', background);
    svg.appendChild(bg);
  }
  svg.appendChild(clone);

  return new XMLSerializer().serializeToString(svg);
};

/** Export a scene region to a downloadable .svg file. */
export const exportSceneSvg = (
  sceneGroup: SVGGElement,
  region: Rect,
  filename: string,
  background = '#ffffff'
): void => {
  const svgString = buildSceneSvgString(sceneGroup, region, background);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, filename);
};
