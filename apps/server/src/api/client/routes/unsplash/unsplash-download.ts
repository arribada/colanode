import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { unsplashDownloadOutputSchema } from '@colanode/core';
import { toSafeLogFields } from '@colanode/server/api/client/lib/log-error';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('api:client:unsplash:download');

// Unsplash's own API host — the only host we will ever ping from this route.
const UNSPLASH_API_HOST = 'api.unsplash.com';

// POST /client/v1/unsplash/download   body: { downloadLocation }
//
// Per the Unsplash API Guidelines, when a photo is actually selected/used the
// app MUST trigger a request to that photo's `download_location` endpoint
// (with the Client-ID header). This route does exactly that, server-side, so
// the Access Key stays on the server. It's best-effort: any failure (or a
// missing key) is swallowed and the route still returns `{ ok: true }` — the
// ping must never break the cover-selection UX.
export const unsplashDownloadRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'POST',
    url: '/download',
    schema: {
      body: z.object({
        downloadLocation: z.string(),
      }),
      response: {
        200: unsplashDownloadOutputSchema,
      },
    },
    handler: async (request) => {
      const accessKey = process.env.UNSPLASH_ACCESS_KEY;
      if (!accessKey) {
        return { ok: true };
      }

      // SSRF guard: only ever call Unsplash's own API host, never an arbitrary
      // URL the client happened to supply.
      let target: URL;
      try {
        target = new URL(request.body.downloadLocation);
      } catch {
        return { ok: true };
      }

      if (target.protocol !== 'https:' || target.hostname !== UNSPLASH_API_HOST) {
        logger.warn(
          `Ignoring Unsplash download trigger for non-Unsplash host: ${target.hostname}`
        );
        return { ok: true };
      }

      try {
        await fetch(target, {
          headers: {
            Authorization: `Client-ID ${accessKey}`,
            'Accept-Version': 'v1',
          },
        });
      } catch (error) {
        // Fire-and-forget: log and move on.
        logger.error(
          toSafeLogFields(error),
          'Failed to trigger Unsplash download endpoint'
        );
      }

      return { ok: true };
    },
  });

  done();
};
