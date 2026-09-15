// ABOUTME: Makes an uploaded SVG inert before the wiki stores it, and marks served
// ABOUTME: files so a browser never renders an active one as a page of the wiki.
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

import { storage } from '@colanode/server/lib/storage';

export const SVG_MIME_TYPE = 'image/svg+xml';

// Sanitizing parses the whole file into a DOM; past this size refusing is safer
// than tying up the server on something no page legitimately needs.
export const MAX_SVG_BYTES = 10 * 1024 * 1024;

export class UnsafeSvgError extends Error {}

const baseType = (contentType: string | null | undefined): string =>
  (contentType ?? '').toLowerCase().split(';')[0]?.trim() ?? '';

export const isSvgMimeType = (
  contentType: string | null | undefined
): boolean => baseType(contentType) === SVG_MIME_TYPE;

// Raster images embedded in the file itself are the one outside reference an
// SVG legitimately needs: design tools export bitmaps that way.
const SAFE_DATA_IMAGE =
  /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

type Purifier = ReturnType<typeof DOMPurify>;

// One DOM for the whole process: building a JSDOM window costs far more than
// cleaning a file, and DOMPurify keeps no per-call state on it.
let shared: { purifier: Purifier; window: JSDOM['window'] } | null = null;

const getPurifier = () => {
  if (shared) {
    return shared;
  }

  const { window } = new JSDOM('');
  const purifier = DOMPurify(
    window as unknown as Parameters<typeof DOMPurify>[0]
  );

  // A link may only point inside the file itself. Anything else is a way to
  // run javascript: from a click or to pull outside content into the image.
  purifier.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName !== 'href' && data.attrName !== 'xlink:href') {
      return;
    }

    const value = data.attrValue.trim();
    if (!value.startsWith('#') && !SAFE_DATA_IMAGE.test(value)) {
      data.keepAttr = false;
    }
  });

  shared = { purifier, window };
  return shared;
};

/**
 * Returns an inert copy of an SVG document: no script, no event handler, no
 * foreignObject, no animation able to rewrite a link, no reference outside the
 * file. Throws when no SVG is left, so a broken or hostile file is refused
 * instead of being stored as an empty image.
 */
export const sanitizeSvg = (source: string): string => {
  if (Buffer.byteLength(source, 'utf8') > MAX_SVG_BYTES) {
    throw new UnsafeSvgError('This SVG is too large to be checked.');
  }

  const { purifier, window } = getPurifier();
  const body = purifier.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script', 'animate', 'set'],
    RETURN_DOM: true,
  }) as unknown as { querySelector: (selector: string) => unknown };

  const svg = body.querySelector('svg');
  if (!svg) {
    throw new UnsafeSvgError('No SVG content was left after cleaning it.');
  }

  // XMLSerializer, not outerHTML: the file is served as image/svg+xml, which is
  // parsed as XML, where an HTML entity such as &nbsp; is a fatal error.
  return new window.XMLSerializer().serializeToString(
    svg as unknown as Parameters<
      InstanceType<typeof window.XMLSerializer>['serializeToString']
    >[0]
  );
};

/**
 * Replaces a stored SVG with its cleaned copy and returns the new size. Used
 * when a browser upload completes, before the file is marked ready, so nobody
 * can ever download the original.
 */
export const sanitizeStoredSvg = async (path: string): Promise<number> => {
  const { stream } = await storage.download(path);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > MAX_SVG_BYTES) {
      throw new UnsafeSvgError('This SVG is too large to be checked.');
    }
    chunks.push(buffer);
  }

  const cleaned = Buffer.from(
    sanitizeSvg(Buffer.concat(chunks).toString('utf8')),
    'utf8'
  );
  await storage.upload(path, cleaned, SVG_MIME_TYPE, BigInt(cleaned.length));
  return cleaned.length;
};

// Types a browser renders as a document rather than decoding as media. Served
// from the wiki's own origin, opening one directly would run its script with
// the wiki's session.
const ACTIVE_TYPES = new Set([
  SVG_MIME_TYPE,
  'text/html',
  'application/xhtml+xml',
  'text/xml',
  'application/xml',
]);

/**
 * Headers for any response that streams stored file bytes. The browser never
 * guesses a type, and an active document -- or a file whose type is unknown --
 * is rendered sandboxed: no script, no same-origin access, nothing loaded.
 * An <img> ignores all of this, so images still display normally.
 */
export const fileSafetyHeaders = (
  contentType: string | null | undefined
): Record<string, string> => {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
  };

  const type = baseType(contentType);
  if (type === '' || ACTIVE_TYPES.has(type)) {
    headers['Content-Security-Policy'] =
      "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'";
  }

  return headers;
};
