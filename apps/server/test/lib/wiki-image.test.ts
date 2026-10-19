import { describe, expect, it } from 'vitest';

import {
  isBlockedAddress,
  loadImageFromBase64,
  loadImageFromUrl,
  MAX_IMAGE_BYTES,
  nameWithExtension,
  sniffImageType,
  WikiImageError,
} from '@colanode/server/lib/ai/wiki-image';

// A 1x1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('isBlockedAddress — the SSRF guard', () => {
  it('blocks loopback', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('127.53.1.9')).toBe(true);
    expect(isBlockedAddress('::1')).toBe(true);
  });

  it('blocks the cloud metadata endpoint', () => {
    // This one matters most: it hands out credentials on a DigitalOcean droplet.
    expect(isBlockedAddress('169.254.169.254')).toBe(true);
  });

  it('blocks every private IPv4 range', () => {
    for (const address of [
      '10.0.0.1',
      '10.255.255.254',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.1',
      '100.64.0.1',
      '198.18.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '240.0.0.1',
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it('blocks unique-local and link-local IPv6', () => {
    expect(isBlockedAddress('fd00::1')).toBe(true);
    expect(isBlockedAddress('fc00::1')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
  });

  it('blocks an IPv4 address smuggled inside IPv6', () => {
    expect(isBlockedAddress('::ffff:169.254.169.254')).toBe(true);
    expect(isBlockedAddress('::ffff:10.0.0.1')).toBe(true);
  });

  it('refuses anything that is not an IP rather than guessing', () => {
    expect(isBlockedAddress('example.com')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });

  it('allows ordinary public addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700::1']) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });

  it('does not block 172.15 or 172.32, which are public', () => {
    expect(isBlockedAddress('172.15.0.1')).toBe(false);
    expect(isBlockedAddress('172.32.0.1')).toBe(false);
  });
});

describe('loadImageFromBase64', () => {
  it('reads a bare base64 payload', () => {
    const image = loadImageFromBase64(PNG_BASE64);
    expect(image.extension).toBe('.png');
    expect(image.mimeType).toBe('image/png');
    expect(image.buffer.length).toBeGreaterThan(50);
  });

  it('takes the type from the bytes, not from the data: URL', () => {
    const image = loadImageFromBase64(`data:image/gif;base64,${PNG_BASE64}`);
    expect(image.mimeType).toBe('image/png');
    expect(image.extension).toBe('.png');
  });

  it('stores bare base64 SVG as SVG, so it is cleaned and can render', () => {
    // What an agent sent for the sales-grid charts: SVG text, no data: prefix,
    // named *.svg.png. It used to be stored as image/png and never displayed.
    const svg =
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const image = loadImageFromBase64(Buffer.from(svg).toString('base64'));
    expect(image.mimeType).toBe('image/svg+xml');
    expect(image.extension).toBe('.svg');
  });

  it('refuses bytes that are no image, whatever the label says', () => {
    const html = Buffer.from('<html><script>x</script></html>').toString(
      'base64'
    );
    expect(() => loadImageFromBase64(`data:image/png;base64,${html}`)).toThrow(
      /not an image/
    );
    expect(() => loadImageFromBase64(html)).toThrow(WikiImageError);
  });

  it('refuses a type it cannot display', () => {
    expect(() =>
      loadImageFromBase64(`data:text/html;base64,${PNG_BASE64}`)
    ).toThrow(WikiImageError);
    expect(() =>
      loadImageFromBase64(`data:application/pdf;base64,${PNG_BASE64}`)
    ).toThrow(WikiImageError);
  });

  it('refuses an empty payload', () => {
    expect(() => loadImageFromBase64('')).toThrow(WikiImageError);
  });

  it('refuses anything over the size cap', () => {
    const huge = Buffer.alloc(MAX_IMAGE_BYTES + 1024).toString('base64');
    expect(() => loadImageFromBase64(`data:image/png;base64,${huge}`)).toThrow(
      /limit is/
    );
  });
});

describe('sniffImageType', () => {
  const bytes = (...values: number[]) => Buffer.from(values);

  it('recognises each raster type by its signature', () => {
    expect(sniffImageType(Buffer.from(PNG_BASE64, 'base64'))).toBe('image/png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe(
      'image/jpeg'
    );
    expect(sniffImageType(Buffer.from('GIF89a......'))).toBe('image/gif');
    expect(sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe(
      'image/webp'
    );
    expect(sniffImageType(Buffer.from('\0\0\0\x1cftypavif\0\0'))).toBe(
      'image/avif'
    );
  });

  it('recognises an SVG behind a BOM, a declaration, comments and a doctype', () => {
    const svg =
      '\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<!-- chart -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<svg width="4">';
    expect(sniffImageType(Buffer.from(svg))).toBe('image/svg+xml');
  });

  it('does not take another XML or HTML document for an SVG', () => {
    expect(
      sniffImageType(Buffer.from('<?xml version="1.0"?><html/>'))
    ).toBeNull();
    expect(sniffImageType(Buffer.from('<svgx/>'))).toBeNull();
    expect(sniffImageType(Buffer.from('hello'))).toBeNull();
  });
});

describe('nameWithExtension', () => {
  it('replaces a wrong image extension instead of stacking a second one', () => {
    expect(nameWithExtension('chart.svg.png', '.svg')).toBe('chart.svg');
    expect(nameWithExtension('photo.jpeg', '.png')).toBe('photo.png');
  });

  it('keeps a right extension and adds a missing one', () => {
    expect(nameWithExtension('chart.PNG', '.png')).toBe('chart.PNG');
    expect(nameWithExtension('power chain', '.png')).toBe('power chain.png');
    expect(nameWithExtension('v1.2', '.png')).toBe('v1.2.png');
    expect(nameWithExtension('  ', '.gif')).toBe('image.gif');
  });
});

describe('loadImageFromUrl', () => {
  it('refuses a non-http protocol', async () => {
    await expect(loadImageFromUrl('file:///etc/passwd')).rejects.toThrow(
      /http\(s\)/
    );
  });

  it('refuses a literal private address', async () => {
    await expect(loadImageFromUrl('http://127.0.0.1/x.png')).rejects.toThrow(
      /private or reserved/
    );
    await expect(
      loadImageFromUrl('http://169.254.169.254/latest/meta-data/')
    ).rejects.toThrow(/private or reserved/);
  });

  it('refuses a neighbouring container by name', async () => {
    // postgres, server and web share a Docker network; the name resolves.
    await expect(loadImageFromUrl('http://postgres:5432/x.png')).rejects.toThrow(
      WikiImageError
    );
  });

  it('refuses a malformed URL', async () => {
    await expect(loadImageFromUrl('not a url')).rejects.toThrow(/valid URL/);
  });
});
