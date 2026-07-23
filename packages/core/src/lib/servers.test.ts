import { describe, expect, it } from 'vitest';

import {
  appendConfigPath,
  hasConfigPath,
  normalizeServerUrl,
} from './servers';

describe('normalizeServerUrl', () => {
  it('prepends https:// to a bare domain', () => {
    const url = normalizeServerUrl('colanode.example.com');
    expect(url?.toString()).toBe('https://colanode.example.com/');
  });

  it('prepends https:// to a bare domain with a path', () => {
    const url = normalizeServerUrl('colanode.example.com/config');
    expect(url?.toString()).toBe('https://colanode.example.com/config');
  });

  it('keeps an explicit http scheme', () => {
    const url = normalizeServerUrl('http://localhost:3000');
    expect(url?.toString()).toBe('http://localhost:3000/');
  });

  it('keeps an explicit https scheme', () => {
    const url = normalizeServerUrl('https://us.colanode.com/config');
    expect(url?.toString()).toBe('https://us.colanode.com/config');
  });

  it('trims surrounding whitespace', () => {
    const url = normalizeServerUrl('  colanode.example.com  ');
    expect(url?.toString()).toBe('https://colanode.example.com/');
  });

  it('returns null for an empty input', () => {
    expect(normalizeServerUrl('')).toBeNull();
    expect(normalizeServerUrl('   ')).toBeNull();
  });

  it('returns null for an invalid url', () => {
    expect(normalizeServerUrl('http://')).toBeNull();
  });
});

describe('hasConfigPath', () => {
  it('detects a /config path', () => {
    expect(hasConfigPath(new URL('https://a.com/config'))).toBe(true);
    expect(hasConfigPath(new URL('https://a.com/config/'))).toBe(true);
    expect(hasConfigPath(new URL('https://a.com/prefix/config'))).toBe(true);
  });

  it('rejects other paths', () => {
    expect(hasConfigPath(new URL('https://a.com'))).toBe(false);
    expect(hasConfigPath(new URL('https://a.com/api'))).toBe(false);
  });
});

describe('appendConfigPath', () => {
  it('appends /config to an origin', () => {
    const url = appendConfigPath(new URL('https://a.com'));
    expect(url.toString()).toBe('https://a.com/config');
  });

  it('appends /config to a path prefix without duplicating slashes', () => {
    const url = appendConfigPath(new URL('https://a.com/prefix/'));
    expect(url.toString()).toBe('https://a.com/prefix/config');
  });

  it('does not mutate the input url', () => {
    const input = new URL('https://a.com/prefix');
    appendConfigPath(input);
    expect(input.toString()).toBe('https://a.com/prefix');
  });
});
