import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import {
  fileSafetyHeaders,
  isSvgMimeType,
  sanitizeSvg,
  UnsafeSvgError,
} from '@colanode/server/lib/files/svg-safety';

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`;

// The cleaned file is served as image/svg+xml, so it must survive a strict XML
// parse; a parsererror element means the browser would show nothing.
const parsesAsSvg = (svg: string): boolean => {
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  return (
    doc.documentElement.localName === 'svg' &&
    doc.getElementsByTagName('parsererror').length === 0
  );
};

describe('sanitizeSvg removes every way to run script', () => {
  it('drops script elements', () => {
    const out = sanitizeSvg(wrap('<script>alert(1)</script><rect width="5"/>'));
    expect(out).not.toMatch(/script/i);
    expect(out).toContain('<rect');
  });

  it('drops event handler attributes', () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="2" onmouseover="alert(2)"/></svg>'
    );
    expect(out).not.toMatch(/onload|onmouseover|alert/i);
    expect(out).toContain('<circle');
  });

  it('drops javascript: links, including entity-encoded ones', () => {
    const out = sanitizeSvg(
      wrap(
        '<a href="javascript:alert(1)"><text>a</text></a>' +
          '<a xlink:href="&#x6A;avascript:alert(2)"><text>b</text></a>'
      )
    );
    expect(out).not.toMatch(/javascript|alert/i);
  });

  it('drops foreignObject and the HTML inside it', () => {
    const out = sanitizeSvg(
      wrap(
        '<foreignObject><iframe src="https://evil.example"></iframe></foreignObject>'
      )
    );
    expect(out).not.toMatch(/foreignObject|iframe|evil/i);
  });

  it('drops animations that could rewrite a link at runtime', () => {
    const out = sanitizeSvg(
      wrap(
        '<a href="#ok"><set attributeName="href" to="javascript:alert(1)"/>' +
          '<animate attributeName="href" values="javascript:alert(2)"/><text>x</text></a>'
      )
    );
    expect(out).not.toMatch(/<set|<animate|javascript/i);
  });

  it('drops references to anything outside the file', () => {
    const out = sanitizeSvg(
      wrap(
        '<image href="https://tracker.example/pixel.png" width="5" height="5"/>'
      )
    );
    expect(out).not.toContain('tracker.example');
  });

  it('does not expand entities declared in a DOCTYPE', () => {
    const out = sanitizeSvg(
      '<!DOCTYPE svg [<!ENTITY boom "BOOMBOOMBOOM">]>' +
        '<svg xmlns="http://www.w3.org/2000/svg"><text>&boom;</text></svg>'
    );
    expect(out).not.toContain('BOOMBOOMBOOM');
    expect(out).not.toContain('ENTITY');
  });
});

describe('sanitizeSvg keeps a real drawing intact', () => {
  it('keeps shapes, gradients, the viewBox and internal references', () => {
    const out = sanitizeSvg(
      wrap(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#5EBD6A"/></linearGradient></defs>' +
          '<rect id="r" width="10" height="10" fill="url(#g)"/><use href="#r" x="2"/>'
      )
    );
    expect(out).toContain('viewBox="0 0 10 10"');
    expect(out).toContain('linearGradient');
    expect(out).toContain('fill="url(#g)"');
    expect(parsesAsSvg(out)).toBe(true);
  });

  it('keeps a bitmap embedded as a data: image', () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const out = sanitizeSvg(
      wrap(`<image href="${png}" width="5" height="5"/>`)
    );
    expect(out).toContain('data:image/png;base64,');
  });

  it('produces XML a browser can parse, even with an HTML entity in the source', () => {
    const out = sanitizeSvg(wrap('<text>a&nbsp;b</text>'));
    expect(parsesAsSvg(out)).toBe(true);
  });
});

describe('sanitizeSvg refuses what it cannot make safe', () => {
  it('refuses a file with no SVG in it', () => {
    expect(() => sanitizeSvg('<p>not an image</p>')).toThrow(UnsafeSvgError);
  });

  it('refuses a file whose only content was hostile', () => {
    expect(() => sanitizeSvg('<script>alert(1)</script>')).toThrow(
      UnsafeSvgError
    );
  });
});

describe('isSvgMimeType', () => {
  it('matches the SVG type with or without parameters, in any case', () => {
    expect(isSvgMimeType('image/svg+xml')).toBe(true);
    expect(isSvgMimeType('IMAGE/SVG+XML; charset=utf-8')).toBe(true);
    expect(isSvgMimeType('image/png')).toBe(false);
    expect(isSvgMimeType(null)).toBe(false);
  });
});

describe('fileSafetyHeaders', () => {
  it('always forbids content sniffing', () => {
    expect(fileSafetyHeaders('image/png')).toEqual({
      'X-Content-Type-Options': 'nosniff',
    });
  });

  it('sandboxes anything a browser would render as a page', () => {
    for (const type of [
      'image/svg+xml',
      'text/html; charset=utf-8',
      'application/xhtml+xml',
      'application/xml',
    ]) {
      expect(fileSafetyHeaders(type)['Content-Security-Policy']).toMatch(
        /^sandbox;/
      );
    }
  });

  it('sandboxes a file whose type is unknown rather than trusting it', () => {
    expect(fileSafetyHeaders(undefined)['Content-Security-Policy']).toMatch(
      /^sandbox;/
    );
  });

  it('leaves ordinary media and documents viewable', () => {
    for (const type of ['image/jpeg', 'application/pdf', 'video/mp4']) {
      expect(
        fileSafetyHeaders(type)['Content-Security-Policy']
      ).toBeUndefined();
    }
  });
});
