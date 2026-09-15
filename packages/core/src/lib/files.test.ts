import { describe, expect, it } from 'vitest';

import { bytesToDataUrl, isSvgFileName, SVG_MIME_TYPE } from './files';

describe('isSvgFileName', () => {
  it('recognises an SVG path whatever the case', () => {
    expect(isSvgFileName('files/ws/01abc_v1.svg')).toBe(true);
    expect(isSvgFileName('Diagram.SVG')).toBe(true);
  });

  it('does not mistake other files for SVG', () => {
    expect(isSvgFileName('photo.png')).toBe(false);
    expect(isSvgFileName('svg-notes.txt')).toBe(false);
    expect(isSvgFileName('archive.svgz')).toBe(false);
  });
});

describe('bytesToDataUrl', () => {
  it('round-trips the exact bytes', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>é ✓</text></svg>';
    const bytes = new TextEncoder().encode(svg);
    const url = bytesToDataUrl(bytes, SVG_MIME_TYPE);

    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const decoded = Buffer.from(url.split(',')[1] ?? '', 'base64').toString(
      'utf8'
    );
    expect(decoded).toBe(svg);
  });

  it('handles a file far larger than one encoding chunk', () => {
    // Spreading a whole array this size into String.fromCharCode would throw a
    // RangeError; chunking is what keeps a large SVG displayable.
    const bytes = new Uint8Array(600_000).map((_, i) => i % 251);
    const url = bytesToDataUrl(bytes, SVG_MIME_TYPE);
    const decoded = Buffer.from(url.split(',')[1] ?? '', 'base64');

    expect(decoded.length).toBe(bytes.length);
    expect(decoded[599_999]).toBe(bytes[599_999]);
  });
});
