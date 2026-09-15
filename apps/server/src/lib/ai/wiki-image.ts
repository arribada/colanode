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

export const loadImageFromBase64 = (data: string): LoadedImage => {
  let mimeType = 'image/png';
  let payload = data.trim();

  const dataUrl = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(payload);
  if (dataUrl) {
    mimeType = dataUrl[1] ?? mimeType;
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
    const mimeType = response.headers.get('content-type') ?? '';
    const extension = fromMime(mimeType);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new WikiImageError(
        `Image is ${Math.round(buffer.length / 1024)}KB; the limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`
      );
    }
    return { buffer, mimeType: mimeType.split(';')[0]?.trim() ?? mimeType, extension };
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
