import { FastifyPluginCallback } from 'fastify';

import { accountAuthenticator } from '@colanode/server/api/client/plugins/account-auth';

import { unsplashDownloadRoute } from './unsplash-download';
import { unsplashSearchRoute } from './unsplash-search';

// Server-side proxy for the Unsplash cover-image picker. Authenticated the
// same way as the avatar routes (any signed-in account). The Unsplash Access
// Key is read from `process.env.UNSPLASH_ACCESS_KEY` inside each handler and
// attached server-side, so it never reaches the client; when the key is unset
// the routes degrade gracefully (empty results / no-op) instead of failing.
export const unsplashRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(accountAuthenticator);

  instance.register(unsplashSearchRoute);
  instance.register(unsplashDownloadRoute);

  done();
};
