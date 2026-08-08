import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { unsplashSearchOutputSchema } from '@colanode/core';
import { toSafeLogFields } from '@colanode/server/api/client/lib/log-error';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('api:client:unsplash:search');

const UNSPLASH_API_BASE = 'https://api.unsplash.com';
const PER_PAGE = 24;

// Minimal shape of the Unsplash `/search/photos` response we depend on. Kept
// deliberately loose (everything optional) so a shape change upstream degrades
// to a skipped field rather than a thrown handler.
interface UnsplashApiPhoto {
  id: string;
  description: string | null;
  alt_description: string | null;
  urls?: { thumb?: string; regular?: string; full?: string };
  user?: { name?: string; username?: string };
  links?: { download_location?: string };
}

interface UnsplashApiSearchResponse {
  results?: UnsplashApiPhoto[];
}

// GET /client/v1/unsplash/search?query=<q>&page=<n>
//
// Proxies an Unsplash photo search. The Access Key is read from the server
// environment and sent as `Authorization: Client-ID <key>`; it is never
// exposed in a response. With no key configured, or an empty query, the route
// returns `{ results: [] }` (200) so the client feature is simply inert.
// Upstream errors / rate-limits are swallowed into
// `{ results: [], error }` — the route never crashes the request.
export const unsplashSearchRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/search',
    schema: {
      querystring: z.object({
        // `.catch` keeps a malformed query/page from ever producing a 400 —
        // the feature must degrade, never error.
        query: z.string().catch(''),
        page: z.coerce.number().int().min(1).max(50).catch(1),
      }),
      response: {
        200: unsplashSearchOutputSchema,
      },
    },
    handler: async (request) => {
      const accessKey = process.env.UNSPLASH_ACCESS_KEY;
      if (!accessKey) {
        // Not configured on this server → feature inert.
        return { results: [] };
      }

      const query = request.query.query.trim();
      if (query.length === 0) {
        return { results: [] };
      }

      try {
        const url = new URL('/search/photos', UNSPLASH_API_BASE);
        url.searchParams.set('query', query);
        url.searchParams.set('page', String(request.query.page));
        url.searchParams.set('per_page', String(PER_PAGE));
        url.searchParams.set('content_filter', 'high');

        const response = await fetch(url, {
          headers: {
            Authorization: `Client-ID ${accessKey}`,
            'Accept-Version': 'v1',
          },
        });

        if (!response.ok) {
          // 403 (usually the hourly rate-limit ceiling) and 429 both mean
          // "throttled" from Unsplash's Demo/Production tiers.
          if (response.status === 403 || response.status === 429) {
            logger.warn(
              `Unsplash search throttled (HTTP ${response.status}) for query length ${query.length}`
            );
            return { results: [], error: 'rate_limited' };
          }

          logger.error(
            `Unsplash search failed with HTTP ${response.status}`
          );
          return { results: [], error: 'unavailable' };
        }

        const data = (await response.json()) as UnsplashApiSearchResponse;

        const results = (data.results ?? [])
          .filter(
            (photo) =>
              photo &&
              photo.urls?.thumb &&
              photo.urls?.regular &&
              photo.urls?.full &&
              photo.links?.download_location
          )
          .map((photo) => ({
            id: photo.id,
            description: photo.description ?? photo.alt_description ?? null,
            thumb: photo.urls!.thumb!,
            regular: photo.urls!.regular!,
            full: photo.urls!.full!,
            authorName: photo.user?.name ?? 'Unknown',
            authorUsername: photo.user?.username ?? '',
            downloadLocation: photo.links!.download_location!,
          }));

        return { results };
      } catch (error) {
        logger.error(toSafeLogFields(error), 'Failed to search Unsplash');
        return { results: [], error: 'unavailable' };
      }
    },
  });

  done();
};
