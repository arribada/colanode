import { describe, expect, it } from 'vitest';

import {
  isBlockedAddress,
  loadImageFromBase64,
  loadImageFromUrl,
  MAX_IMAGE_BYTES,
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

  it('reads a data: URL and takes its declared type', () => {
    const image = loadImageFromBase64(`data:image/gif;base64,${PNG_BASE64}`);
    expect(image.extension).toBe('.gif');
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
