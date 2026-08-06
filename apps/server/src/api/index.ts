import { FastifyPluginCallback } from 'fastify';

import { clientRoutes } from '@colanode/server/api/client/routes';
import { mcpRoutes } from '@colanode/server/api/client/routes/mcp';
import { oauthRoutes } from '@colanode/server/api/client/routes/oauth';
import { configGetRoute } from '@colanode/server/api/config';
import { homeRoute } from '@colanode/server/api/home';
import { publicShareRoute } from '@colanode/server/api/share';
import { shareApiRoute } from '@colanode/server/api/share-api';
import { config } from '@colanode/server/lib/config';

export const apiRoutes: FastifyPluginCallback = (instance, _, done) => {
  const prefix = config.pathPrefix ? `/${config.pathPrefix}` : '';

  instance.register(homeRoute, { prefix });
  instance.register(configGetRoute, { prefix });
  instance.register(clientRoutes, { prefix: `${prefix}/client/v1` });
  instance.register(mcpRoutes, { prefix: `${prefix}/client` });
  // OAuth 2.1 discovery + endpoints must live at the domain root (no prefix)
  // so /.well-known/oauth-* and /oauth/* are reachable where clients probe.
  instance.register(oauthRoutes);
  instance.register(publicShareRoute);
  instance.register(shareApiRoute);

  done();
};
