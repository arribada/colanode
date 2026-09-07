// ABOUTME: Link-unfurl route. Crawlers (Slackbot, etc.) are routed here by the
// ABOUTME: edge nginx so a pasted wiki page URL previews with the PAGE title.
import { FastifyPluginCallback } from 'fastify';

import { database } from '@colanode/server/data/database';

// The Arribada wiki brand shown as the site name / fallback title (matches the
// web app's static <title>). Only the page TITLE is exposed here, never content.
const SITE_NAME = 'Arribada Wiki';

// Plausible Colanode node id (IdType prefix + id chars). Loose on purpose: a
// non-match just falls back to the generic title.
const NODE_ID_RE = /^[a-z0-9_-]{12,}$/i;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const unfurlRoute: FastifyPluginCallback = (instance, _, done) => {
  instance.get('/unfurl/*', async (request, reply) => {
    // '*' holds the ORIGINAL page path the crawler requested (nginx prefixes
    // /unfurl to it). Rebuild the canonical URL and take the last path segment
    // as a candidate node id.
    const wildcard = (request.params as Record<string, string>)['*'] ?? '';
    const rawPath = `/${wildcard.replace(/^\/+/, '')}`;
    const path = rawPath.split('?')[0] ?? rawPath;
    const proto =
      (request.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
    const host =
      (request.headers['x-forwarded-host'] as string | undefined) ??
      (request.headers.host as string | undefined) ??
      '';
    const canonical = `${proto}://${host}${path}`;

    const segments = path.split('/').filter(Boolean);
    const candidate = segments[segments.length - 1] ?? '';

    let pageTitle: string | null = null;
    if (NODE_ID_RE.test(candidate)) {
      try {
        const node = await database
          .selectFrom('nodes')
          .select(['attributes'])
          .where('id', '=', candidate)
          .executeTakeFirst();
        const attributes = node?.attributes as { name?: unknown } | undefined;
        const name = attributes?.name;
        if (typeof name === 'string' && name.trim().length > 0) {
          pageTitle = name.trim();
        }
      } catch {
        // Fall back to the generic title on any lookup error.
      }
    }

    const title = pageTitle ? `${pageTitle} · ${SITE_NAME}` : SITE_NAME;
    const t = escapeHtml(title);
    const site = escapeHtml(SITE_NAME);
    const url = escapeHtml(canonical);

    const html =
      '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      `<title>${t}</title>` +
      `<meta property="og:title" content="${t}">` +
      `<meta property="og:site_name" content="${site}">` +
      `<meta property="og:type" content="article">` +
      (url ? `<meta property="og:url" content="${url}">` : '') +
      `<meta name="twitter:card" content="summary">` +
      `<meta name="twitter:title" content="${t}">` +
      // A human who somehow lands here is sent straight to the real page.
      (url ? `<meta http-equiv="refresh" content="0; url=${url}">` : '') +
      '</head><body></body></html>';

    return reply
      .type('text/html')
      .header('cache-control', 'public, max-age=300')
      .send(html);
  });

  done();
};
