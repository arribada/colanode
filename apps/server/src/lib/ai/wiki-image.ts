// ABOUTME: Loads image bytes for the wiki upload tool, from base64 or from a URL
// ABOUTME: the server is allowed to reach — the SSRF guard lives here, on its own.
import dns from 'node:dns/promises';
import net from 'node:net';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Rendered through <img src>. SVG is accepted but is a document, not a bitmap:
// the upload tool cleans it before storing it (lib/files/svg-safety). For a
// diagram a mermaid block is still better -- it stays editable.
const ALLOWED_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};

export class WikiImageError extends Error {}

/**
 * True for any address the wiki server must never be talked into fetching.
 *
 * This matters more here than on a typical server: the wiki shares a Docker
 * network with Postgres, Plane, the devices dashboard and the cloud metadata
 * endpoint, and an agent is precisely the component that can be persuaded to
 * name a URL it should not.
 */
export const isBlockedAddress = (address: string): boolean => {
  const version = net.isIP(address);
  if (version === 0) {
    return true; // not an IP at all: refuse rather than guess
  }

  if (version === 4) {
    const parts = address.split('.').map((part) => Number(part));
    const [a = 0, b = 0] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 and 192.0.2.0/24
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier NAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }
  // ::ffff:10.0.0.1 and friends map straight onto the IPv4 rules above.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped && mapped[1]) {
    return isBlockedAddress(mapped[1]);
  }
  return false;
};

export interface LoadedImage {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

const fromMime = (mimeType: string): string => {
  const extension = ALLOWED_MIME[mimeType.toLowerCase().split(';')[0]?.trim() ?? ''];
  if (!extension) {
    throw new WikiImageError(
      `Unsupported image type "${mimeType}". Allowed: ${Object.keys(ALLOWED_MIME).join(', ')}.`
    );
  }
  return extension;
};

const startsWith = (buffer: Buffer, bytes: number[], offset = 0): boolean =>
  buffer.length >= offset + bytes.length &&
  bytes.every((byte, index) => buffer[offset + index] === byte);

/**
 * The image type the bytes themselves carry, or null for anything that is not
 * an image the wiki can display. The declared type cannot be trusted: an agent
 * sent SVG documents as bare base64 named "chart.svg.png", they were stored as
 * image/png, and no browser renders an SVG served under that type -- the page
 * showed a file chip instead of the chart, and the SVG skipped cleaning.
 */
export const sniffImageType = (buffer: Buffer): string | null => {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (/^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('latin1'))) {
    return 'image/gif';
  }
  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    buffer.subarray(4, 8).toString('latin1') === 'ftyp' &&
    /^avi[fs]$/.test(buffer.subarray(8, 12).toString('latin1'))
  ) {
    return 'image/avif';
  }

  // An SVG may open with a BOM, an XML declaration, comments or a doctype
  // before its root element; past that preamble the root must be <svg.
  const head = buffer
    .subarray(0, 4096)
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .replace(/^\s*<\?xml[\s\S]*?\?>/, '')
    .replace(/^(\s*(<!--[\s\S]*?-->|<!DOCTYPE[^>]*>))*/i, '')
    .trimStart();
  if (/^<svg[\s>/]/i.test(head)) {
    return 'image/svg+xml';
  }
  return null;
};

/**
 * The type to store an image under: the one its bytes carry. A declared type
 * outside the allowed list is still refused, so a caller cannot slip in a
 * document by labelling it, and bytes no browser can draw are refused too.
 */
const resolveImageType = (buffer: Buffer, declared: string | null): string => {
  if (declared) {
    fromMime(declared);
  }
  const sniffed = sniffImageType(buffer);
  if (!sniffed) {
    throw new WikiImageError(
      `These bytes are not an image the wiki can display. Allowed: ${Object.keys(ALLOWED_MIME).join(', ')}.`
    );
  }
  return sniffed;
};

/**
 * The file name with the extension of its real type: "chart.svg.png" holding
 * an SVG becomes "chart.svg", not "chart.svg.png.svg".
 */
export const nameWithExtension = (given: string, extension: string): string => {
  const trimmed = given.trim();
  if (trimmed.length === 0) {
    return `image${extension}`;
  }
  if (trimmed.toLowerCase().endsWith(extension)) {
    return trimmed;
  }
  const knownExtensions = new Set([...Object.values(ALLOWED_MIME), '.jpeg']);
  const dot = trimmed.lastIndexOf('.');
  const current = dot > 0 ? trimmed.slice(dot).toLowerCase() : '';
  const stem = knownExtensions.has(current) ? trimmed.slice(0, dot) : trimmed;
  return stem.toLowerCase().endsWith(extension) ? stem : stem + extension;
};

export const loadImageFromBase64 = (data: string): LoadedImage => {
  let declared: string | null = null;
  let payload = data.trim();

  const dataUrl = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(payload);
  if (dataUrl) {
    declared = dataUrl[1] ?? null;
    payload = dataUrl[3] ?? '';
  }

  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0) {
    throw new WikiImageError('The base64 payload decoded to nothing.');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new WikiImageError(
      `Image is ${Math.round(buffer.length / 1024)}KB; the limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`
    );
  }
  const mimeType = resolveImageType(buffer, declared);
  return { buffer, mimeType, extension: fromMime(mimeType) };
};

export const loadImageFromUrl = async (raw: string): Promise<LoadedImage> => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WikiImageError('That is not a valid URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new WikiImageError('Only http(s) URLs can be fetched.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dns.lookup(host, { all: true })).map(
        (entry) => entry.address
      );
    } catch {
      // A name that does not resolve must come back as a clean refusal, not as
      // a raw ENOTFOUND from the resolver.
      throw new WikiImageError(`Could not resolve ${host}.`);
    }
  }

  if (addresses.length === 0) {
    throw new WikiImageError(`Could not resolve ${host}.`);
  }
  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new WikiImageError(
        `Refusing to fetch ${host}: it resolves to a private or reserved address.`
      );
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    // A redirect could land on a private address after the check above, so we
    // refuse them outright rather than re-validating every hop.
    const response = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new WikiImageError(`Fetching the image returned ${response.status}.`);
    }
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > MAX_IMAGE_BYTES) {
      throw new WikiImageError(
        `Image is ${Math.round(declared / 1024)}KB; the limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`
      );
    }
    const contentType = response.headers.get('content-type') ?? '';
    fromMime(contentType);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new WikiImageError(
        `Image is ${Math.round(buffer.length / 1024)}KB; the limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`
      );
    }
    const mimeType = resolveImageType(buffer, contentType);
    return { buffer, mimeType, extension: fromMime(mimeType) };
  } catch (error) {
    if (error instanceof WikiImageError) {
      throw error;
    }
    throw new WikiImageError(
      `Could not fetch the image: ${error instanceof Error ? error.message : 'unknown error'}.`
    );
  } finally {
    clearTimeout(timer);
  }
};
